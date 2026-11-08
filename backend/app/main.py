# main.py - the FastAPI app. Start-up order: wait for MySQL, create the tables,
# make the first admin if there are no users yet, then serve the /api routes.

import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app import auth, db, settings, store
from app.routes import admin, chat, login, voice

log = logging.getLogger("uvicorn.error")


def create_first_admin():
    if db.count_users() > 0:
        return
    if not (settings.ADMIN_USERNAME and settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD):
        log.warning("No users yet, and ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD are not set.")
        return
    db.create_user(settings.ADMIN_USERNAME, settings.ADMIN_EMAIL,
                   auth.hash_password(settings.ADMIN_PASSWORD), "admin")
    log.info("First admin '%s' created from .env.", settings.ADMIN_USERNAME)


@asynccontextmanager
async def lifespan(app):
    os.makedirs(settings.UPLOAD_FOLDER, exist_ok=True)
    db.wait_until_ready()
    db.create_tables()
    create_first_admin()
    yield


app = FastAPI(title="Gemini Chat API", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
app.include_router(login.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(voice.router, prefix="/api")


@app.get("/api/health")
def health():
    """Used by Docker to know the backend is ready. Checks MySQL and Redis too."""
    db.run_query("SELECT 1", fetch=True)
    store.ping()
    return {"status": "ok"}
