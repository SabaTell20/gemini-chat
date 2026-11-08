# admin.py - user management and the billing dashboard. Admins only.

from datetime import date
from typing import Optional
import mysql.connector
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app import auth, db
from app.pricing import prices_for

router = APIRouter(prefix="/admin")
TOKEN_TYPES = ["Input (not cached)", "Cached input", "Output", "Thinking"]
FEATURES = ["Thinking", "Streaming", "Google Search", "Voice", "Image", "PDF"]


class NewUser(BaseModel):
    username: str
    email: str
    password: str
    again: str
    role: str = "user"


class NewPassword(BaseModel):
    password: str
    again: str


class NewRole(BaseModel):
    role: str


def last_admin_check(user_id):
    """The last admin can't be demoted or deleted."""
    row = db.get_user_by_id(user_id)
    if row is None:
        raise HTTPException(404, "User not found.")
    if row[3] == "admin" and db.count_admins() <= 1:
        raise HTTPException(400, "This is the last admin. Make someone else admin first.")


@router.get("/users")
def list_users(me=Depends(auth.admin_user)):
    return [
        {"id": uid, "username": username, "email": email, "role": role,
         "created_at": created_at.strftime("%b %d, %Y")}
        for uid, username, email, role, created_at in db.list_users()
    ]


@router.post("/users")
def create_user(body: NewUser, me=Depends(auth.admin_user)):
    username, email = body.username.strip(), body.email.strip()
    if not username or "@" not in email:
        raise HTTPException(400, "Fill in a username and a valid email.")
    if body.role not in ("user", "admin"):
        raise HTTPException(400, "The role must be user or admin.")
    problem = auth.password_problem(body.password, body.again)
    if problem:
        raise HTTPException(400, problem)
    try:
        db.create_user(username, email, auth.hash_password(body.password), body.role)
    except mysql.connector.IntegrityError:
        raise HTTPException(400, "That username or email is already used.")
    return {"message": f"User '{username}' created."}


@router.put("/users/{user_id}/password")
def change_password(user_id: int, body: NewPassword, me=Depends(auth.admin_user)):
    user = db.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(404, "User not found.")
    problem = auth.password_problem(body.password, body.again)
    if problem:
        raise HTTPException(400, problem)
    auth.change_password(user_id, body.password)      # also logs them out everywhere
    return {"message": f"Password of {user[1]} changed."}


@router.put("/users/{user_id}/role")
def change_role(user_id: int, body: NewRole, me=Depends(auth.admin_user)):
    if body.role not in ("user", "admin"):
        raise HTTPException(400, "The role must be user or admin.")
    user = db.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(404, "User not found.")
    if body.role == user[3]:
        return {"message": ""}
    if body.role == "user":
        last_admin_check(user_id)
    db.set_role(user_id, body.role)
    return {"message": f"{user[1]} is now {body.role}."}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, me=Depends(auth.admin_user)):
    if user_id == me["id"]:
        raise HTTPException(400, "You can't delete yourself.")
    last_admin_check(user_id)
    user = db.get_user_by_id(user_id)
    auth.delete_user(user_id)
    return {"message": f"{user[1]} and all their data were deleted."}


@router.get("/billing")
def billing(start: Optional[date] = None, end: Optional[date] = None, me=Depends(auth.admin_user)):
    """The date filter picks the chats CREATED between start and end;
    every number here is calculated from those chats only."""
    sessions = db.get_sessions_overview()
    # each row: (session_id, title, created_at, is_deleted, username, message_count, last_activity)
    today = date.today()
    if not sessions:
        return {"first_day": None, "today": str(today), "start": None, "end": None, "sessions": []}

    first_day = min(s[2].date() for s in sessions)
    start = start or first_day
    end = end or today
    chosen = [s for s in sessions if start <= s[2].date() <= end]
    chosen_ids = {s[0] for s in chosen}

    per_session = {}      # session_id -> {"tokens": [4 numbers], "costs": [4 numbers]}
    per_day = {}          # day -> cost in $
    for session_id, day, inp, cached, out, think in db.get_usage_by_session_day():
        if session_id not in chosen_ids or day is None:
            continue
        tokens = [int(inp), int(cached), int(out), int(think)]
        prices = prices_for(day)
        data = per_session.setdefault(session_id, {"tokens": [0, 0, 0, 0], "costs": [0.0] * 4})
        for i in range(4):
            cost = tokens[i] / 1_000_000 * prices[i]
            data["tokens"][i] += tokens[i]
            data["costs"][i] += cost
            per_day[day] = per_day.get(day, 0.0) + cost

    total_tokens = [0, 0, 0, 0]
    total_costs = [0.0, 0.0, 0.0, 0.0]
    for data in per_session.values():
        for i in range(4):
            total_tokens[i] += data["tokens"][i]
            total_costs[i] += data["costs"][i]
    total_cost = sum(total_costs)

    likes = dislikes = time_sum = time_count = 0
    for session_id, l, d, t_sum, t_count in db.get_answer_stats_by_session():
        if session_id in chosen_ids:
            likes += int(l or 0)
            dislikes += int(d or 0)
            time_sum += int(t_sum or 0)
            time_count += int(t_count or 0)

    features = [0, 0, 0, 0, 0, 0]     # thinking, streaming, searching, voice, image, pdf
    for row in db.get_feature_usage_by_session():
        if row[0] in chosen_ids:
            for i in range(6):
                features[i] += int(row[i + 1] or 0)

    n_sessions = len(chosen)
    rated = likes + dislikes
    rows = []
    for session_id, title, created_at, is_deleted, username, message_count, last_activity in chosen:
        data = per_session.get(session_id, {"tokens": [0] * 4, "costs": [0.0] * 4})
        rows.append({
            "id": session_id,
            "title": title,
            "user": username,
            "status": "Deleted" if is_deleted else "Active",
            "created": created_at.strftime("%Y-%m-%d %H:%M"),
            "last_activity": last_activity.strftime("%Y-%m-%d %H:%M") if last_activity else "",
            "messages": message_count,
            "tokens": sum(data["tokens"]),
            "cost": sum(data["costs"]),
        })

    return {
        "first_day": str(first_day),
        "today": str(today),
        "start": str(start),
        "end": str(end),
        "kpis": [
            {"label": "Total cost", "value": f"${total_cost:.4f}", "note": ""},
            {"label": "Sessions", "value": str(n_sessions),
             "note": f"{sum(1 for s in chosen if s[3])} deleted"},
            {"label": "Messages", "value": str(sum(s[5] for s in chosen)), "note": ""},
            {"label": "Per session",
             "value": f"${total_cost / n_sessions:.4f}" if n_sessions else "–", "note": "average cost"},
            {"label": "Input tokens", "value": f"{total_tokens[0] + total_tokens[1]:,}",
             "note": "cached included"},
            {"label": "Output tokens", "value": f"{total_tokens[2] + total_tokens[3]:,}",
             "note": "thinking included"},
            {"label": "Avg response time",
             "value": f"{time_sum / time_count / 1000:.1f}s" if time_count else "–",
             "note": f"{time_count} timed answers"},
            {"label": "Liked answers", "value": f"{likes / rated * 100:.0f}%" if rated else "–",
             "note": f"{likes} likes · {dislikes} dislikes"},
        ],
        "cost_per_day": [{"label": str(d), "value": per_day[d]} for d in sorted(per_day)],
        "cost_by_type": [{"label": TOKEN_TYPES[i], "value": total_costs[i]} for i in range(4)],
        "features": [{"label": FEATURES[i], "value": features[i]} for i in range(6)],
        "sessions": rows,
    }
