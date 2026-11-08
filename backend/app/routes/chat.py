# chat.py - chats, messages, uploads, and talking to Gemini.

import json
import logging
import os
import re
import time
import uuid
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from google import genai
from google.genai import types
from pydantic import BaseModel
from app import auth, db, settings
from app.pricing import cost_of

router = APIRouter()
log = logging.getLogger("uvicorn.error")

SYSTEM_PROMPT = "You are a helpful assistant. Answer clearly and simply."
DEFAULT_TEXT = "Please look at the attached file."     # sent when only a file is attached
MAX_FILE_BYTES = 20 * 1024 * 1024                      # 20 MB per file

# the file types we accept, and the type we tell Gemini (we don't trust the browser's)
FILE_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".mp3": "audio/mp3", ".wav": "audio/wav", ".ogg": "audio/ogg",
    ".flac": "audio/flac", ".aac": "audio/aac",
}


_client = None


def gemini():
    """One shared Gemini client. It must stay alive: a client that gets thrown away
    closes its connection, even in the middle of a call."""
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.API_KEY)
    return _client


class Rename(BaseModel):
    title: str


class Feedback(BaseModel):
    feedback: Optional[str] = None


def date_group(created_at):
    """Which heading a chat goes under in the sidebar."""
    days = (date.today() - created_at.date()).days
    if days <= 0:
        return "Today"
    if days == 1:
        return "Yesterday"
    if days <= 7:
        return "Previous 7 days"
    return "Older"


def own_session(session_id, user):
    """404 unless this chat exists and belongs to you (and is not deleted)."""
    row = db.get_session(session_id)
    if row is None or row[0] != user["id"] or row[2]:
        raise HTTPException(404, "Chat not found.")
    return row


# ---------------- the sidebar ----------------

@router.get("/sessions")
def list_sessions(user=Depends(auth.current_user)):
    return [
        {"session_id": sid, "title": title, "group": date_group(created_at)}
        for sid, title, created_at in db.list_sessions(user["id"])       # only YOUR chats
    ]


@router.patch("/sessions/{session_id}")
def rename_session(session_id: str, body: Rename, user=Depends(auth.current_user)):
    title = body.title.strip()[:100]
    if title:
        db.rename_session(session_id, user["id"], title)
    return {"ok": True}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, user=Depends(auth.current_user)):
    db.delete_session(session_id, user["id"])
    return {"ok": True}


# ---------------- one conversation ----------------

@router.get("/sessions/{session_id}/messages")
def get_messages(session_id: str, user=Depends(auth.current_user)):
    row = own_session(session_id, user)
    files = {}
    for attachment_id, message_id, file_name, mime_type, _ in db.load_attachments(session_id, user["id"]):
        files.setdefault(message_id, []).append(
            {"id": attachment_id, "name": file_name, "mime_type": mime_type}
        )
    return {
        "title": row[1],
        "messages": [
            {"id": mid, "role": role, "text": text, "transcription": transcription,
             "feedback": feedback, "files": files.get(mid, [])}
            for mid, role, text, transcription, feedback in db.load_messages(session_id, user["id"])
        ],
    }


@router.post("/messages/{message_id}/feedback")
def save_feedback(message_id: int, body: Feedback, user=Depends(auth.current_user)):
    if body.feedback not in ("like", "dislike", None):
        raise HTTPException(400, "Feedback must be like, dislike or empty.")
    db.save_feedback(message_id, user["id"], body.feedback)
    return {"ok": True}


@router.get("/files/{attachment_id}")
def get_file(attachment_id: int, user=Depends(auth.current_user)):
    """Uploaded files are only given to the owner of the chat."""
    row = db.get_attachment(attachment_id, user["id"])
    if row is None or not os.path.isfile(row[2]):
        raise HTTPException(404, "File not found.")
    file_name, mime_type, path = row
    # audio/mp3 is what Gemini expects; browsers know it as audio/mpeg
    media_type = "audio/mpeg" if mime_type == "audio/mp3" else mime_type
    return FileResponse(path, media_type=media_type, filename=file_name,
                        content_disposition_type="inline",
                        headers={"X-Content-Type-Options": "nosniff"})


# ---------------- uploads ----------------

def save_uploads(files):
    """Save the uploaded files. Returns a list of (file_name, mime_type, file_path)."""
    saved = []
    try:
        for upload in files:
            name = os.path.basename(upload.filename or "file")[:255]
            extension = os.path.splitext(name)[1].lower()
            if extension not in FILE_TYPES:
                raise HTTPException(400, f"{name}: this file type is not allowed.")
            path = os.path.join(settings.UPLOAD_FOLDER, uuid.uuid4().hex + extension)
            saved.append((name, FILE_TYPES[extension], path))
            size = 0
            with open(path, "wb") as out:
                while chunk := upload.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_FILE_BYTES:
                        raise HTTPException(413, f"{name} is larger than 20 MB.")
                    out.write(chunk)
    except Exception:
        remove_files(saved)
        raise
    return saved


def remove_files(files):
    for _, _, path in files:
        auth.delete_upload(path)


# ---------------- Gemini helpers ----------------

def make_parts(text, files):
    parts = []
    for file_name, mime_type, file_path in files:
        with open(file_path, "rb") as f:
            parts.append(types.Part.from_bytes(data=f.read(), mime_type=mime_type))
    parts.append(types.Part(text=text))
    return parts


def has_type(files, prefix):
    return any(mime_type.startswith(prefix) for _, mime_type, _ in files)


def token_counts(usage):
    """Split Gemini's usage numbers into [not cached input, cached, output, thinking]."""
    if usage is None:
        return [0, 0, 0, 0]
    cached = usage.cached_content_token_count or 0
    input_tokens = (usage.prompt_token_count or 0) - cached
    output_tokens = usage.candidates_token_count or 0
    thinking_tokens = usage.thoughts_token_count or 0
    return [input_tokens, cached, output_tokens, thinking_tokens]


def save_usage_from(session_id, message_id, usage):
    db.save_usage(session_id, message_id, *token_counts(usage))


def transcribe(file_path, mime_type):
    with open(file_path, "rb") as f:
        audio = types.Part.from_bytes(data=f.read(), mime_type=mime_type)
    response = gemini().models.generate_content(
        model=settings.MODEL,
        contents=[audio, "Transcribe this audio word for word. Return only the transcript."],
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level="low")
        ),
    )
    return response.text, response.usage_metadata


def maybe_update_title(session_id, answer_id):
    # Runs after every user message, but only acts once: on the 5th
    if db.count_user_messages(session_id) != 5:
        return
    recent = db.get_recent_messages(session_id, limit=10)
    convo = "\n".join(f"{role}: {text}" for role, text in recent)
    response = gemini().models.generate_content(
        model=settings.MODEL,
        contents="Write a short title of 3 to 6 words for this chat. "
                 "Reply with the title only, no quotes.\n\n" + convo,
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level="low")
        ),
    )
    db.set_title(session_id, response.text.strip()[:100])
    save_usage_from(session_id, answer_id, response.usage_metadata)


def line(**event):
    """One line of the answer stream: a small JSON object, one per line."""
    return json.dumps(event, ensure_ascii=False) + "\n"


def run_chat(session_id, is_new, user, text, new_files, use_thinking, use_streaming, use_search):
    """The answer stream. Like the original app, nothing is saved until Gemini has answered,
    so a failed message leaves no half-finished chat behind."""
    done = False
    try:
        yield line(type="start", session_id=session_id)

        # the whole conversation so far, with its files, plus the new message
        contents = []
        attachments = {}
        for _, message_id, file_name, mime_type, file_path in db.load_attachments(session_id, user["id"]):
            attachments.setdefault(message_id, []).append((file_name, mime_type, file_path))
        for message_id, role, message, _, _ in db.load_messages(session_id, user["id"]):
            gemini_role = "model" if role == "assistant" else "user"
            parts = make_parts(message, attachments.get(message_id, []))
            contents.append(types.Content(role=gemini_role, parts=parts))
        contents.append(types.Content(role="user", parts=make_parts(text, new_files)))

        tools = [types.Tool(google_search=types.GoogleSearch())] if use_search else None
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            tools=tools,
            thinking_config=types.ThinkingConfig(thinking_level="high" if use_thinking else "low"),
        )

        client = gemini()
        start = time.time()                      # start the stopwatch for response_time_ms
        answer = ""
        usage = None
        if use_streaming:
            for chunk in client.models.generate_content_stream(
                model=settings.MODEL, contents=contents, config=config
            ):
                if chunk.usage_metadata:
                    usage = chunk.usage_metadata
                if chunk.text:
                    answer += chunk.text
                    yield line(type="chunk", text=chunk.text)
        else:
            response = client.models.generate_content(
                model=settings.MODEL, contents=contents, config=config
            )
            answer = response.text or ""
            usage = response.usage_metadata
            yield line(type="chunk", text=answer)
        response_time_ms = int((time.time() - start) * 1000)

        if not answer:
            yield line(type="error", message="Gemini returned an empty answer. Please try again.")
            return

        if is_new:
            db.create_session(session_id, text[:30], user["id"])

        is_voice = has_type(new_files, "audio/")
        # "#" = normal message. A voice memo starts empty and gets its transcript below
        user_message_id = db.save_message(session_id, text, "user", None if is_voice else "#")
        for file_name, mime_type, file_path in new_files:
            db.save_attachment(session_id, user_message_id, file_name, mime_type, file_path)

        answer_id = db.save_message(session_id, answer, "assistant")
        counts = token_counts(usage)             # [not cached input, cached, output, thinking]
        db.save_assistant_message(
            answer_id,
            session_id,
            settings.MODEL,
            counts[0] + counts[1],               # input_tokens = all input, cached included
            counts[2] + counts[3],               # output_tokens = output + thinking
            cost_of(date.today(), *counts),
            response_time_ms,
        )
        save_usage_from(session_id, answer_id, usage)
        db.save_sender_params(
            user_message_id, use_thinking, use_streaming, use_search, is_voice,
            has_type(new_files, "image/"), has_type(new_files, "application/pdf"), settings.MODEL,
        )
        done = True                              # the message is safe, keep its files

        # The message is saved now, so a problem below must not look like a failed message.
        try:
            maybe_update_title(session_id, answer_id)
        except Exception:
            log.exception("The title could not be updated")

        transcripts = []
        for _, mime_type, file_path in new_files:
            if mime_type.startswith("audio/"):
                yield line(type="status", text="Transcribing voice memo…")
                try:
                    transcript, transcript_usage = transcribe(file_path, mime_type)
                    transcripts.append(transcript)
                    save_usage_from(session_id, user_message_id, transcript_usage)
                except Exception:
                    log.exception("The voice memo could not be transcribed")
        if transcripts:
            db.save_transcription(user_message_id, "\n".join(transcripts))

        yield line(type="done", session_id=session_id)

    except Exception as error:
        log.exception("Chat failed")
        yield line(type="error", message=f"Something went wrong: {str(error)[:300]}")
    finally:
        if not done:
            remove_files(new_files)              # nothing was saved, so don't keep the files


@router.post("/chat")
def send_message(
    session_id: str = Form(""),
    text: str = Form(""),
    thinking: bool = Form(False),
    streaming: bool = Form(False),
    search: bool = Form(False),
    files: List[UploadFile] = File(default=[]),
    user=Depends(auth.current_user),
):
    if not text.strip() and not files:
        raise HTTPException(400, "Write a message or attach a file.")

    is_new = not session_id
    if is_new:
        session_id = str(uuid.uuid4())
    else:
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", session_id):
            raise HTTPException(400, "Bad chat id.")
        own_session(session_id, user)

    saved = save_uploads(files)
    # X-Accel-Buffering: tells nginx to pass every word on straight away
    return StreamingResponse(
        run_chat(session_id, is_new, user, text.strip() or DEFAULT_TEXT, saved,
                 thinking, streaming, search),
        media_type="application/x-ndjson",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store"},
    )
