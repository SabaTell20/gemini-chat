# settings.py - every setting comes from environment variables, which Docker Compose
# fills in from the .env file. Nothing secret is written in the code.

import os

API_KEY = os.getenv("API_KEY", "")
MODEL = os.getenv("MODEL", "gemini-4-argon")

DB_HOST = os.getenv("DB_HOST", "mysql")
DB_USER = os.getenv("DB_USER", "chatbot")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "chatbot_db")

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID", "")

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "/data/uploads")
