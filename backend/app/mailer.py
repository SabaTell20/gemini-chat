# mailer.py - sends emails through Resend's SMTP server. All settings come from .env.

import os
import smtplib
from email.message import EmailMessage

SETTINGS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"]


def send_email(to, subject, body):
    missing = [name for name in SETTINGS if not os.getenv(name)]
    if missing:
        raise RuntimeError("Missing in .env: " + ", ".join(missing))

    message = EmailMessage()
    message["From"] = os.getenv("MAIL_FROM")
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    # port 465 = an encrypted (SSL) connection from the very first byte
    with smtplib.SMTP_SSL(os.getenv("SMTP_HOST"), int(os.getenv("SMTP_PORT")), timeout=20) as server:
        server.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD"))
        server.send_message(message)
