# db.py - every function that talks to MySQL lives here

import time
import mysql.connector
from app.settings import DB_HOST, DB_NAME, DB_PASSWORD, DB_USER


def connect():
    return mysql.connector.connect(
        host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME
    )


def run_query(sql, values=(), fetch=False):
    """Open a connection, run ONE sql command, close the connection."""
    conn = connect()
    cursor = conn.cursor()
    try:
        cursor.execute(sql, values)
        if fetch:
            return cursor.fetchall()    # SELECT: return all rows
        conn.commit()                   # INSERT / UPDATE: save the change
        return cursor.lastrowid         # and return the id of the new row
    finally:
        cursor.close()
        conn.close()


def wait_until_ready(seconds=60):
    """Docker waits for MySQL's healthcheck, but one extra safety net costs nothing."""
    deadline = time.time() + seconds
    while True:
        try:
            run_query("SELECT 1", fetch=True)
            return
        except mysql.connector.Error:
            if time.time() > deadline:
                raise
            time.sleep(2)


def create_tables():
    """Create every table the first time the app runs. Forgot-password codes and failed
    sign-ins are not here: they live in Redis (see store.py)."""
    # one row per person who can log in. The password is stored HASHED, never as plain text
    run_query("""
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(10) NOT NULL DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # "stay logged in": one row per browser that ticked "Keep me signed in".
    # The browser keeps a random key in a cookie; here we only keep its HASH.
    run_query("""
        CREATE TABLE IF NOT EXISTS login_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token_hash CHAR(64) NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # one row per chat. Deleting a chat means flipping is_deleted here
    run_query("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id VARCHAR(36) PRIMARY KEY,
            user_id INT NULL,
            session_title VARCHAR(100) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_deleted BOOLEAN DEFAULT FALSE
        )
    """)
    # transcription: the text of a voice memo, or "#" for a normal message
    run_query("""
        CREATE TABLE IF NOT EXISTS messages (
            message_id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(36) NOT NULL,
            message MEDIUMTEXT NOT NULL,
            role VARCHAR(10) NOT NULL,
            transcription TEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (session_id)
        )
    """)
    # one row per bot answer. input_tokens includes cached tokens,
    # output_tokens includes thinking tokens (both are billed as output)
    run_query("""
        CREATE TABLE IF NOT EXISTS assistant_messages (
            message_id INT PRIMARY KEY,
            session_id VARCHAR(36) NOT NULL,
            model VARCHAR(50) NOT NULL,
            input_tokens INT NULL,
            output_tokens INT NULL,
            cost DECIMAL(12, 8) NULL,
            response_time_ms INT NULL,
            feedback VARCHAR(10) NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (session_id)
        )
    """)
    # one row per user message: which switches were on and which file types were sent
    run_query("""
        CREATE TABLE IF NOT EXISTS sender_params (
            param_id INT AUTO_INCREMENT PRIMARY KEY,
            message_id INT NOT NULL,
            is_thinking BOOLEAN DEFAULT FALSE,
            is_streaming BOOLEAN DEFAULT FALSE,
            is_searching BOOLEAN DEFAULT FALSE,
            is_voice BOOLEAN DEFAULT FALSE,
            is_image BOOLEAN DEFAULT FALSE,
            is_pdf BOOLEAN DEFAULT FALSE,
            model VARCHAR(50) NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (message_id)
        )
    """)
    # created_at lets the billing page group the cost by day
    run_query("""
        CREATE TABLE IF NOT EXISTS token_usage (
            usage_id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(36) NOT NULL,
            message_id INT NOT NULL,
            input_tokens INT DEFAULT 0,
            cached_tokens INT DEFAULT 0,
            output_tokens INT DEFAULT 0,
            thinking_tokens INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (session_id)
        )
    """)
    run_query("""
        CREATE TABLE IF NOT EXISTS attachments (
            attachment_id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(36) NOT NULL,
            message_id INT NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            file_path VARCHAR(500) NOT NULL,
            INDEX (session_id)
        )
    """)


# ---------------- sessions (chats) ----------------

def create_session(session_id, title, user_id):
    """Add a chat to the sessions table (called when its first message is sent)."""
    run_query(
        "INSERT INTO sessions (session_id, user_id, session_title) VALUES (%s, %s, %s)",
        (session_id, user_id, title),
    )


def get_session(session_id):
    """(user_id, title, is_deleted) of a chat, or None."""
    rows = run_query(
        "SELECT user_id, session_title, is_deleted FROM sessions WHERE session_id = %s",
        (session_id,), fetch=True,
    )
    return rows[0] if rows else None


def list_sessions(user_id):
    """Get (session_id, title, created_at) for every chat of ONE user that is not deleted,
    newest first. created_at lets the sidebar group chats by Today / Yesterday / ..."""
    return run_query(
        "SELECT session_id, session_title, created_at FROM sessions "
        "WHERE user_id = %s AND is_deleted = 0 ORDER BY created_at DESC",
        (user_id,),
        fetch=True,
    )


def rename_session(session_id, user_id, title):
    """Give a chat a new title. The user_id check makes sure it is YOUR chat."""
    run_query(
        "UPDATE sessions SET session_title = %s WHERE session_id = %s AND user_id = %s",
        (title, session_id, user_id),
    )


def delete_session(session_id, user_id):
    """SOFT delete: one row changes, nothing is removed.
    The user_id check makes sure you can only delete your OWN chats."""
    run_query(
        "UPDATE sessions SET is_deleted = 1 WHERE session_id = %s AND user_id = %s",
        (session_id, user_id),
    )


# ---------------- automatic titles ----------------

def count_user_messages(session_id):
    """How many messages the USER has sent in this chat (assistant answers are not counted)."""
    rows = run_query(
        "SELECT COUNT(*) FROM messages WHERE session_id = %s AND role = 'user'",
        (session_id,),
        fetch=True,
    )
    return int(rows[0][0])


def get_recent_messages(session_id, limit):
    """(role, text) of the LAST messages of a chat, oldest first.
    A voice memo gives its transcription instead of the placeholder sentence.
    "#" (= not a voice message) and NULL both mean: use the message itself."""
    return run_query(
        "SELECT role, content FROM ("
        "    SELECT message_id, role, "
        "      CASE WHEN transcription IS NULL OR transcription = '#' "
        "           THEN message ELSE transcription END AS content "
        "    FROM messages WHERE session_id = %s ORDER BY message_id DESC LIMIT %s"
        ") t ORDER BY message_id",
        (session_id, limit),
        fetch=True,
    )


def set_title(session_id, title):
    """Replace the title of a chat (done once, after the 5th user message)."""
    run_query(
        "UPDATE sessions SET session_title = %s WHERE session_id = %s",
        (title, session_id),
    )


# ---------------- messages ----------------

def save_message(session_id, message, role, transcription="#"):
    """Insert one chat message and return its message_id.
    transcription: "#" for a normal message, None for a voice memo
    (the real text is filled in later by save_transcription)."""
    return run_query(
        "INSERT INTO messages (session_id, message, role, transcription) VALUES (%s, %s, %s, %s)",
        (session_id, message, role, transcription),
    )


def save_transcription(message_id, transcription):
    """Store the text of a voice memo on its message."""
    run_query(
        "UPDATE messages SET transcription = %s WHERE message_id = %s",
        (transcription, message_id),
    )


def load_messages(session_id, user_id):
    """Get (message_id, role, message, transcription, feedback) for a chat, oldest first.
    Only works for a chat that belongs to user_id (anyone else gets nothing)."""
    return run_query(
        "SELECT m.message_id, m.role, m.message, m.transcription, a.feedback "
        "FROM messages m "
        "JOIN sessions s ON s.session_id = m.session_id AND s.user_id = %s "
        "LEFT JOIN assistant_messages a ON a.message_id = m.message_id "
        "WHERE m.session_id = %s ORDER BY m.message_id",
        (user_id, session_id),
        fetch=True,
    )


def save_assistant_message(message_id, session_id, model,
                           input_tokens, output_tokens, cost, response_time_ms):
    """Record which model wrote an answer, how many tokens it used, what it cost
    and how long Gemini took to answer (in milliseconds)."""
    run_query(
        "INSERT INTO assistant_messages "
        "(message_id, session_id, model, input_tokens, output_tokens, cost, response_time_ms) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (message_id, session_id, model, input_tokens, output_tokens, cost, response_time_ms),
    )


def save_feedback(message_id, user_id, feedback):
    """Store 'like', 'dislike' or None (NULL) for an answer in one of YOUR chats."""
    run_query(
        "UPDATE assistant_messages a JOIN sessions s ON s.session_id = a.session_id "
        "SET a.feedback = %s WHERE a.message_id = %s AND s.user_id = %s",
        (feedback, message_id, user_id),
    )


def save_sender_params(message_id, is_thinking, is_streaming, is_searching,
                       is_voice, is_image, is_pdf, model):
    """Record the switches, file types and model of one user message."""
    run_query(
        "INSERT INTO sender_params "
        "(message_id, is_thinking, is_streaming, is_searching, is_voice, is_image, is_pdf, model) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (message_id, is_thinking, is_streaming, is_searching, is_voice, is_image, is_pdf, model),
    )


# ---------------- users ----------------

def create_user(username, email, password_hash, role="user"):
    """Add a user and return the new id. password_hash must ALREADY be hashed."""
    return run_query(
        "INSERT INTO users (username, email, password_hash, role) VALUES (%s, %s, %s, %s)",
        (username, email, password_hash, role),
    )


def get_user_by_id(user_id):
    """(id, username, email, role) or None. Never returns the password hash."""
    rows = run_query(
        "SELECT id, username, email, role FROM users WHERE id = %s", (user_id,), fetch=True
    )
    return rows[0] if rows else None


def get_user_by_email(email):
    """(id, username, email, role) or None."""
    rows = run_query(
        "SELECT id, username, email, role FROM users WHERE email = %s", (email,), fetch=True
    )
    return rows[0] if rows else None


def get_login_by_email(email):
    """(id, password_hash) for logging in, or None. Upper/lower case doesn't matter."""
    rows = run_query(
        "SELECT id, password_hash FROM users WHERE email = %s", (email,), fetch=True
    )
    return rows[0] if rows else None


def list_users():
    """(id, username, email, role, created_at) of every user. No password hashes."""
    return run_query(
        "SELECT id, username, email, role, created_at FROM users ORDER BY id", fetch=True
    )


def count_users():
    return int(run_query("SELECT COUNT(*) FROM users", fetch=True)[0][0])


def count_admins():
    return int(run_query("SELECT COUNT(*) FROM users WHERE role = 'admin'", fetch=True)[0][0])


def set_password_hash(user_id, password_hash):
    run_query("UPDATE users SET password_hash = %s WHERE id = %s", (password_hash, user_id))


def set_role(user_id, role):
    run_query("UPDATE users SET role = %s WHERE id = %s", (role, user_id))


# ---------------- stay logged in ----------------

def save_login_token(user_id, token_hash, days):
    """Remember a browser for `days` days. Old, expired keys are cleaned up at the same time."""
    run_query("DELETE FROM login_tokens WHERE expires_at < NOW()")
    run_query(
        "INSERT INTO login_tokens (user_id, token_hash, expires_at) "
        "VALUES (%s, %s, NOW() + INTERVAL %s DAY)",
        (user_id, token_hash, days),
    )


def get_user_id_by_token(token_hash):
    """The user id that belongs to a key that has not expired, or None."""
    rows = run_query(
        "SELECT user_id FROM login_tokens WHERE token_hash = %s AND expires_at > NOW()",
        (token_hash,),
        fetch=True,
    )
    return rows[0][0] if rows else None


def delete_login_token(token_hash):
    """Log out ONE browser."""
    run_query("DELETE FROM login_tokens WHERE token_hash = %s", (token_hash,))


def delete_login_tokens_for_user(user_id):
    """Log a user out on EVERY browser (used when their password changes)."""
    run_query("DELETE FROM login_tokens WHERE user_id = %s", (user_id,))


# ---------------- files ----------------

def save_attachment(session_id, message_id, file_name, mime_type, file_path):
    """Remember that a file belongs to a message. The file itself is on disk."""
    run_query(
        "INSERT INTO attachments (session_id, message_id, file_name, mime_type, file_path) "
        "VALUES (%s, %s, %s, %s, %s)",
        (session_id, message_id, file_name, mime_type, file_path),
    )


def load_attachments(session_id, user_id):
    """Get (attachment_id, message_id, file_name, mime_type, file_path) for every file
    of a chat that belongs to user_id."""
    return run_query(
        "SELECT a.attachment_id, a.message_id, a.file_name, a.mime_type, a.file_path "
        "FROM attachments a "
        "JOIN sessions s ON s.session_id = a.session_id AND s.user_id = %s "
        "WHERE a.session_id = %s ORDER BY a.attachment_id",
        (user_id, session_id),
        fetch=True,
    )


def get_attachment(attachment_id, user_id):
    """(file_name, mime_type, file_path) of one file, only if it is in YOUR chat."""
    rows = run_query(
        "SELECT a.file_name, a.mime_type, a.file_path FROM attachments a "
        "JOIN sessions s ON s.session_id = a.session_id AND s.user_id = %s "
        "WHERE a.attachment_id = %s",
        (user_id, attachment_id),
        fetch=True,
    )
    return rows[0] if rows else None


# ---------------- tokens and billing ----------------

def save_usage(session_id, message_id, input_tokens, cached_tokens, output_tokens, thinking_tokens):
    """Store the token counts of one Gemini call."""
    run_query(
        "INSERT INTO token_usage "
        "(session_id, message_id, input_tokens, cached_tokens, output_tokens, thinking_tokens) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (session_id, message_id, input_tokens, cached_tokens, output_tokens, thinking_tokens),
    )


def get_sessions_overview():
    """For EVERY chat of EVERY user, deleted ones included, newest first:
    (session_id, title, created_at, is_deleted, username, message_count, last_activity).
    last_activity = the time of the newest message in that chat."""
    return run_query(
        "SELECT s.session_id, s.session_title, s.created_at, s.is_deleted, "
        "  COALESCE(u.username, '-'), "
        "  (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.session_id), "
        "  (SELECT MAX(m.created_at) FROM messages m WHERE m.session_id = s.session_id) "
        "FROM sessions s LEFT JOIN users u ON u.id = s.user_id "
        "ORDER BY s.created_at DESC",
        fetch=True,
    )


def get_answer_stats_by_session():
    """For every chat: (session_id, likes, dislikes, sum of response times in ms,
    number of answers that have a response time). Used for the averages and the ratio."""
    return run_query(
        "SELECT session_id, SUM(feedback = 'like'), SUM(feedback = 'dislike'), "
        "  SUM(response_time_ms), COUNT(response_time_ms) "
        "FROM assistant_messages GROUP BY session_id",
        fetch=True,
    )


def get_usage_by_session_day():
    """Token totals for each chat on each day. The billing page prices every day
    with the rates that were valid on that day."""
    return run_query(
        "SELECT session_id, DATE(created_at), SUM(input_tokens), SUM(cached_tokens), "
        "SUM(output_tokens), SUM(thinking_tokens) "
        "FROM token_usage GROUP BY session_id, DATE(created_at)",
        fetch=True,
    )


def get_feature_usage_by_session():
    """For every chat: how many user messages used each feature:
    (session_id, thinking, streaming, searching, voice, image, pdf)."""
    return run_query(
        "SELECT m.session_id, SUM(p.is_thinking), SUM(p.is_streaming), SUM(p.is_searching), "
        "  SUM(p.is_voice), SUM(p.is_image), SUM(p.is_pdf) "
        "FROM sender_params p JOIN messages m ON m.message_id = p.message_id "
        "GROUP BY m.session_id",
        fetch=True,
    )


# ---------------- delete a user and ALL their data (right to erasure) ----------------

def delete_user_and_data(user_id):
    """PERMANENTLY delete a user and everything that belongs to them, in ONE transaction
    (all of it is deleted, or nothing is). Returns the paths of their uploaded files,
    so the caller can remove those from the disk too."""
    conn = connect()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT a.file_path FROM attachments a "
            "JOIN sessions s ON s.session_id = a.session_id WHERE s.user_id = %s",
            (user_id,),
        )
        files = [row[0] for row in cursor.fetchall()]
        for sql in [
            "DELETE p FROM sender_params p JOIN messages m ON m.message_id = p.message_id "
            "JOIN sessions s ON s.session_id = m.session_id WHERE s.user_id = %s",
            "DELETE a FROM assistant_messages a JOIN sessions s ON s.session_id = a.session_id "
            "WHERE s.user_id = %s",
            "DELETE t FROM token_usage t JOIN sessions s ON s.session_id = t.session_id "
            "WHERE s.user_id = %s",
            "DELETE a FROM attachments a JOIN sessions s ON s.session_id = a.session_id "
            "WHERE s.user_id = %s",
            "DELETE m FROM messages m JOIN sessions s ON s.session_id = m.session_id "
            "WHERE s.user_id = %s",
            "DELETE FROM sessions WHERE user_id = %s",
            "DELETE FROM login_tokens WHERE user_id = %s",
            "DELETE FROM users WHERE id = %s",
        ]:
            cursor.execute(sql, (user_id,))
        conn.commit()
    except Exception:
        conn.rollback()                 # something failed: undo everything
        raise
    finally:
        cursor.close()
        conn.close()
    return files
