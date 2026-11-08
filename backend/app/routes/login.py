# login.py - sign in, sign out, and forgot password.

import logging
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from app import auth

router = APIRouter()
log = logging.getLogger("uvicorn.error")


class Login(BaseModel):
    email: str
    password: str
    remember: bool = True


class Forgot(BaseModel):
    email: str


class Reset(BaseModel):
    email: str
    code: str
    new_password: str
    again: str


@router.post("/auth/login")
def login(body: Login, response: Response):
    if not body.email.strip():
        raise HTTPException(400, "Please enter your email.")
    if auth.login_blocked(body.email):
        raise HTTPException(429, f"Too many wrong passwords. Please wait {auth.LOCKOUT_MINUTES} "
                                 "minutes or reset your password.")
    user_id = auth.log_in(body.email, body.password)
    if user_id is None:
        raise HTTPException(401, "Wrong email or password.")
    token = auth.start_session(user_id, body.remember)
    # HttpOnly: JavaScript can't read this cookie. Without max_age it ends with the browser.
    response.set_cookie(auth.COOKIE, token, httponly=True, samesite="strict", path="/",
                        max_age=auth.REMEMBER_SECONDS if body.remember else None)
    return {"ok": True}


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    auth.end_session(request.cookies.get(auth.COOKIE))
    response.delete_cookie(auth.COOKIE, path="/", samesite="strict", httponly=True)
    return {"ok": True}


@router.get("/auth/me")
def me(user=Depends(auth.current_user)):
    return user


@router.post("/auth/forgot")
def forgot(body: Forgot):
    if not body.email.strip():
        raise HTTPException(400, "Please enter your email.")
    try:
        auth.send_reset_code(body.email)
    except Exception:
        log.exception("Sending the reset email failed")
        raise HTTPException(502, "The email could not be sent. Please try again later.")
    return {"ok": True}


@router.post("/auth/reset")
def reset(body: Reset):
    problem = auth.password_problem(body.new_password, body.again)
    if problem:
        raise HTTPException(400, problem)
    problem = auth.reset_password(body.email, body.code, body.new_password)
    if problem:
        raise HTTPException(400, problem)
    return {"ok": True}
