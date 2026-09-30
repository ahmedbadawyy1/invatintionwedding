#!/usr/bin/env python3
"""Invitation site plus a small RSVP store.

Run from this folder:
    python3 server.py

Replies are saved in data/rsvps.json.
Open http://127.0.0.1:4173/guests.html on this computer to read them.
"""

from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "rsvps.json"
LOCK = Lock()
HOST = "0.0.0.0"
PORT = 4173
MAX_BODY = 8_000


def load_replies():
    if not DATA_FILE.exists():
        return []
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return data if isinstance(data, list) else []


def save_replies(replies):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        json.dumps(replies, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def clean(value, limit):
    text = " ".join(str(value or "").split())
    return text[:limit]


def is_local(address):
    host = address or ""
    return host in {"127.0.0.1", "::1"} or host.endswith("127.0.0.1")


class InvitationHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/rsvps":
            if not is_local(self.client_address[0]):
                self.send_json(403, {"ok": False, "error": "local-only"})
                return
            self.send_json(200, {"ok": True, "replies": load_replies()})
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path != "/api/rsvp":
            self.send_json(404, {"ok": False, "error": "not-found"})
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > MAX_BODY:
            self.send_json(400, {"ok": False, "error": "bad-request"})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(400, {"ok": False, "error": "bad-json"})
            return

        name = clean(payload.get("name"), 80)
        attending = payload.get("attending")
        message = clean(payload.get("message"), 500)
        if len(name) < 1 or attending not in {"yes", "no"}:
            self.send_json(400, {"ok": False, "error": "invalid"})
            return

        reply = {
            "name": name,
            "attending": attending,
            "message": message,
            "lang": "en" if payload.get("lang") == "en" else "ar",
            "submittedAt": datetime.now(timezone.utc).isoformat(),
        }

        with LOCK:
            replies = load_replies()
            replies.append(reply)
            save_replies(replies)

        self.send_json(201, {"ok": True})

    def send_json(self, status, body):
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


if __name__ == "__main__":
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer((HOST, PORT), InvitationHandler)
    print("Invitation: http://127.0.0.1:%s/" % PORT)
    print("RSVP list:  http://127.0.0.1:%s/guests.html" % PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
