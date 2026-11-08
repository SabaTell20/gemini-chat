# The FastAPI backend: a small Python image that runs uvicorn on port 8000.
FROM python:3.12-slim

# tzdata lets the TZ setting from .env work, so "today" matches your computer.
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

# Run as a normal user, not root. Uploaded files live in /data/uploads (a Docker volume).
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /data/uploads && chown -R appuser /data
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
