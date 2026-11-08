# set_password.py - emergency: set a password from the terminal.
#   docker compose exec backend python -m app.set_password you@example.com
# The password is typed in hidden, and it also logs that user out everywhere.

import getpass
import sys
from app import auth, db

if len(sys.argv) != 2:
    sys.exit("Usage: python -m app.set_password EMAIL")
user = db.get_user_by_email(sys.argv[1].strip())
if user is None:
    sys.exit("No user has that email.")
password = getpass.getpass("New password (at least 8 characters): ")
problem = auth.password_problem(password, getpass.getpass("Type it again: "))
if problem:
    sys.exit(problem)
auth.change_password(user[0], password)
print(f"Password of {user[1]} changed.")
