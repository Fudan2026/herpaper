#!/usr/bin/env python3
"""PaperDesk 本地服务：静态托管 + 文献库持久化 + 只读分享 + 学术 API 代理。

用法：python3 serve.py [端口]   默认 8765，绑定 127.0.0.1
数据全部保存在本目录 data/ 下，不写入任何个人目录。
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
if not DATA.is_dir():
    DATA.mkdir(parents=True, exist_ok=True)
STATE_FILE = DATA / "state.json"
SHARE_FILE = DATA / "shares.json"

ALLOW_HOSTS = {
    "api.openalex.org",
    "api.crossref.org",
    "www.ebi.ac.uk",
    "api.semanticscholar.org",
    "export.arxiv.org",
}
_cache = {}

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".png": "image/png",
}


def read_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path, obj):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def empty_state():
    return {
        "library": [],
        "groups": [],
        "settings": {"style": "gbt7714", "citeMode": "numbered", "journal": ""},
        "manuscript": "",
        "updatedAt": 0,
    }


def proxy_fetch(target):
    q = urllib.parse.urlparse(target)
    if q.scheme not in ("http", "https") or q.hostname not in ALLOW_HOSTS:
        raise ValueError("host not allowed")
    hit = _cache.get(target)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    req = urllib.request.Request(
        target,
        headers={
            "User-Agent": "PaperDesk/1.0 (local research tool; mailto:research@example.com)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        payload = resp.read().decode("utf-8", "replace")
    _cache[target] = (time.time(), payload)
    return payload


class Handler(BaseHTTPRequestHandler):
    server_version = "PaperDesk/1.0"

    def log_message(self, fmt, *args):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _file(self, rel, code=200):
        path = (ROOT / rel).resolve()
        if not str(path).startswith(str(ROOT)) or not path.is_file():
            self._json({"error": "not found"}, 404)
            return
        body = path.read_bytes()
        self.send_response(code)
        self.send_header("Content-Type", MIME.get(path.suffix.lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return {}

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        p, qs = u.path, urllib.parse.parse_qs(u.query)
        try:
            if p == "/api/state":
                return self._json(read_json(STATE_FILE, empty_state()))
            if p == "/api/shares":
                return self._json(read_json(SHARE_FILE, {}))
            if p.startswith("/api/share/"):
                sid = p.rsplit("/", 1)[-1]
                snap = read_json(SHARE_FILE, {}).get(sid)
                return self._json(snap if snap else {"error": "share not found"}, 200 if snap else 404)
            if p == "/api/proxy":
                target = (qs.get("url") or [""])[0]
                try:
                    payload = proxy_fetch(target)
                    body = payload.encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(body)
                except Exception as exc:
                    self._json({"error": str(exc)}, 502)
                return
            if p.startswith("/share/"):
                return self._file("index.html")
            if p in ("", "/"):
                return self._file("index.html")
            return self._file(p.lstrip("/"))
        except Exception as exc:
            self._json({"error": str(exc)}, 500)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        p = u.path
        body = self._body()
        try:
            if p == "/api/state":
                body["updatedAt"] = int(time.time())
                write_json(STATE_FILE, body)
                return self._json({"ok": True, "updatedAt": body["updatedAt"]})
            if p == "/api/share":
                import hashlib
                sid = hashlib.sha1(
                    (str(time.time()) + json.dumps(body, ensure_ascii=False)[:200]).encode()
                ).hexdigest()[:10]
                shares = read_json(SHARE_FILE, {})
                shares[sid] = {
                    "id": sid,
                    "name": body.get("name") or "共享文献组",
                    "items": body.get("items") or [],
                    "note": body.get("note") or "",
                    "createdAt": int(time.time()),
                }
                write_json(SHARE_FILE, shares)
                return self._json({"ok": True, "id": sid, "url": "/share/" + sid})
        except Exception as exc:
            return self._json({"error": str(exc)}, 500)
        self._json({"error": "unknown endpoint"}, 404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"PaperDesk running at http://127.0.0.1:{port}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
