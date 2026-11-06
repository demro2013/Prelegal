import os

# TestClient talks plain HTTP, which wouldn't send back a Secure cookie.
os.environ["PRELEGAL_COOKIE_SECURE"] = "false"
