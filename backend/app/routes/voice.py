# voice.py - the browser talks to ElevenLabs directly; it only needs the agent id.
# The agent is public, so no API key is involved. Voice chats are NOT saved.

from fastapi import APIRouter, Depends
from app import auth, settings

router = APIRouter()


@router.get("/voice/config")
def voice_config(user=Depends(auth.current_user)):
    return {"agent_id": settings.ELEVENLABS_AGENT_ID}
