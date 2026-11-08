# auth.py - passwords, logging in, login sessions and forgot-password codes

import hashlib
import os
import secrets
import bcrypt
from fastapi import Depends, HTTPException, Request
from app import db, mailer, settings, store

COOKIE = "gemini_chat_session"
MAX_CODE_ATTEMPTS = 5
MAX_LOGIN_FAILURES = 5              # wrong passwords allowed per email ...
LOCKOUT_MINUTES = 15                # ... within this many minutes
RESET_MINUTES = 15                  # a reset code works this long
SESSION_SECONDS = 24 * 3600         # a login WITHOUT "Keep me signed in"
REMEMBER_SECONDS = store.REMEMBER_SECONDS   # "Keep me signed in" lasts 30 days


def hash_password(password):
    """Scramble a password (or code) with a random salt. It can't be turned back."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password(password, password_hash):
    """True if the password matches the hash."""
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:              # e.g. a password longer than bcrypt allows
        return False


def password_problem(password, again):
    """Returns a message saying what is wrong with a new password, or None if it is fine."""
    if len(password) < 8:
        return "The password must be at least 8 characters."
    if len(password.encode()) > 72:
        return "The password is too long (max 72 characters)."
    if password != again:
        return "The two passwords are different."
    return None


def login_blocked(email):
    """True if this email had too many wrong passwords recently."""
    return store.count_login_failures(email.strip().lower(), LOCKOUT_MINUTES) >= MAX_LOGIN_FAILURES


def log_in(email, password):
    """Returns the user's id if email + password are right, otherwise None.
    Wrong tries are counted, so password guessing gets blocked (see login_blocked)."""
    email = email.strip().lower()
    user = db.get_login_by_email(email)                  # (id, password_hash)
    if user and check_password(password, user[1]):
        store.clear_login_failures(email)
        return user[0]
    store.add_login_failure(email, LOCKOUT_MINUTES)
    return None


def send_reset_code(email):
    """Email a 6-digit code to this address IF a user has it.
    It says nothing either way, so strangers can't find out which emails have accounts."""
    user = db.get_user_by_email(email.strip())
    if user is None:
        return
    user_id = user[0]
    if store.reset_sent_recently(user_id):
        return                                  # max one email per minute
    code = f"{secrets.randbelow(1_000_000):06d}"   # random 000000-999999
    store.save_reset(user_id, hash_password(code), RESET_MINUTES)
    mailer.send_email(
        user[2],
        "Your password reset code",
        f"Hi {user[1]},\n\n"
        f"Your code is: {code}\n\n"
        "It works for 15 minutes. If you did not ask for this, you can ignore this email.",
    )


def reset_password(email, code, new_password):
    """Set a new password if the code is right. Returns None on success,
    otherwise a message saying what went wrong."""
    user = db.get_user_by_email(email.strip())
    reset = store.get_reset(user[0]) if user else None
    if reset is None:
        return "This code is wrong or has expired. Ask for a new code."

    user_id = user[0]
    code_hash, attempts = reset
    if attempts >= MAX_CODE_ATTEMPTS:
        store.delete_reset(user_id)
        return "Too many wrong tries. Ask for a new code."
    if not check_password(code.strip(), code_hash):
        store.add_reset_attempt(user_id)
        left = MAX_CODE_ATTEMPTS - attempts - 1
        if left == 0:
            store.delete_reset(user_id)
            return "Wrong code. That was the last try, ask for a new code."
        return f"Wrong code. {left} tries left."

    change_password(user_id, new_password)
    store.delete_reset(user_id)                 # a code works only once
    return None


def change_password(user_id, new_password):
    """Save a new password and log this user out on every browser."""
    db.set_password_hash(user_id, hash_password(new_password))
    log_out_everywhere(user_id)


def log_out_everywhere(user_id):
    store.delete_user_sessions(user_id)
    db.delete_login_tokens_for_user(user_id)


# ---------------- login sessions ----------------
# The browser keeps a random key in an HttpOnly cookie. We only ever store its SHA-256
# hash: in Redis for every login, and also in MySQL for "Keep me signed in", so a
# remembered login still works if Redis is ever emptied.

def _token_hash(token):
    # the key is long and random, so a fast SHA-256 hash is enough here (bcrypt is for passwords)
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(user_id, remember):
    """Make a new random key for this browser. Returns the key (it goes in the cookie)."""
    token = secrets.token_urlsafe(32)
    token_hash = _token_hash(token)
    store.save_session(token_hash, user_id, REMEMBER_SECONDS if remember else SESSION_SECONDS)
    if remember:
        db.save_login_token(user_id, token_hash, REMEMBER_SECONDS // 86400)
    return token


def user_id_from_token(token):
    """The user id for a key from a cookie, or None if it is unknown or expired."""
    if not isinstance(token, str) or not token or len(token) > 200:
        return None                    # no cookie, or a broken/tampered one: just ignore it
    token_hash = _token_hash(token)
    user_id = store.get_session(token_hash)
    if user_id is None:
        user_id = db.get_user_id_by_token(token_hash)
        if user_id is not None:
            store.save_session(token_hash, user_id, 3600)     # back in the fast store
    return user_id


def end_session(token):
    """Log out: this key stops working."""
    if token:
        token_hash = _token_hash(token)
        store.delete_session(token_hash)
        db.delete_login_token(token_hash)


def current_user(request: Request):
    """The logged-in user, read from MySQL on EVERY request, so if an admin changes
    someone's role (or deletes them) it counts straight away. Otherwise a 401."""
    user_id = user_id_from_token(request.cookies.get(COOKIE))
    row = db.get_user_by_id(user_id) if user_id else None
    if row is None:
        raise HTTPException(401, "Please sign in.")
    return {"id": row[0], "username": row[1], "email": row[2], "role": row[3]}


def admin_user(user=Depends(current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Only admins can do this.")
    return user


# ---------------- delete an account (right to erasure) ----------------

def delete_user(user_id):
    """Permanently delete a user, all their chats and data, and their uploaded files."""
    user = db.get_user_by_id(user_id)                 # (id, username, email, role)
    if user is None:
        return
    files = db.delete_user_and_data(user_id)
    for path in files:
        delete_upload(path)
    store.delete_user_sessions(user_id)
    store.delete_reset(user_id)
    store.clear_login_failures(user[2].lower())


def delete_upload(path):
    # safety: only ever delete files that are inside the uploads folder
    folder = os.path.abspath(settings.UPLOAD_FOLDER)
    full = os.path.abspath(path)
    if full.startswith(folder + os.sep) and os.path.isfile(full):
        os.remove(full)
