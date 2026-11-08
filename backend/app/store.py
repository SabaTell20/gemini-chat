# store.py - everything that lives in Redis. These are short-lived security values:
#
#   session:<hash>        which user a login cookie belongs to (expires by itself)
#   user_sessions:<id>    the list of that user's sessions, to log them out everywhere
#   login_fail:<email>    times of wrong passwords, for the 5-in-15-minutes lockout
#   reset:<user id>       the hashed 6-digit code + wrong tries (expires after 15 minutes)
#   reset_sent:<user id>  stops more than one reset email per minute
#
# Redis saves to disk (appendonly, on a Docker volume), so these survive a restart.

import time
import redis
from app import settings

client = redis.Redis(host=settings.REDIS_HOST, password=settings.REDIS_PASSWORD or None,
                     decode_responses=True)

REMEMBER_SECONDS = 30 * 24 * 3600


def ping():
    return client.ping()


# ---------------- login sessions ----------------

def save_session(token_hash, user_id, seconds):
    client.setex(f"session:{token_hash}", seconds, user_id)
    client.sadd(f"user_sessions:{user_id}", token_hash)
    client.expire(f"user_sessions:{user_id}", REMEMBER_SECONDS)


def get_session(token_hash):
    value = client.get(f"session:{token_hash}")
    return int(value) if value else None


def delete_session(token_hash):
    client.delete(f"session:{token_hash}")


def delete_user_sessions(user_id):
    """Log a user out on EVERY browser."""
    key = f"user_sessions:{user_id}"
    hashes = client.smembers(key)
    if hashes:
        client.delete(*[f"session:{h}" for h in hashes])
    client.delete(key)


# ---------------- stop password guessing ----------------
# A sorted set of timestamps, so "the last 15 minutes" is a real sliding window.

def count_login_failures(email, minutes):
    key = f"login_fail:{email}"
    client.zremrangebyscore(key, 0, time.time() - minutes * 60)
    return client.zcard(key)


def add_login_failure(email, minutes):
    key = f"login_fail:{email}"
    now = time.time()
    client.zadd(key, {str(now): now})
    client.expire(key, minutes * 60)


def clear_login_failures(email):
    client.delete(f"login_fail:{email}")


# ---------------- forgot-password codes ----------------

def save_reset(user_id, code_hash, minutes):
    """A new code replaces any older one, and disappears by itself when it expires."""
    key = f"reset:{user_id}"
    client.delete(key)
    client.hset(key, mapping={"code_hash": code_hash, "attempts": 0})
    client.expire(key, minutes * 60)


def get_reset(user_id):
    """(code_hash, attempts) of the active code, or None."""
    data = client.hgetall(f"reset:{user_id}")
    return (data["code_hash"], int(data["attempts"])) if data else None


def add_reset_attempt(user_id):
    client.hincrby(f"reset:{user_id}", "attempts", 1)


def delete_reset(user_id):
    client.delete(f"reset:{user_id}")


def reset_sent_recently(user_id):
    """True if a code was already sent in the last 60 seconds. If not, starts that minute."""
    return not client.set(f"reset_sent:{user_id}", 1, nx=True, ex=60)
