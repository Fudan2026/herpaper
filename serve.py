#!/usr/bin/env python3
"""HerPaper 本地服务：静态托管 + 文献库持久化 + 只读分享 + 学术 API 代理。

用法：python3 serve.py [端口]   默认 8765，绑定 127.0.0.1
数据全部保存在本目录 data/ 下，不写入任何个人目录。
"""
import json
import sys
import time
import hashlib
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import zotero_sync

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
if not DATA.is_dir():
    DATA.mkdir(parents=True, exist_ok=True)
STATE_FILE = DATA / "state.json"
SHARE_FILE = DATA / "shares.json"
SYNC_FILE = DATA / "sync_state.json"
CONFIG_FILE = DATA / "config.json"

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


def zotero_config():
    return read_json(CONFIG_FILE, {"userId": "0", "apiKey": "", "localKey": "", "serverId": ""})


def make_sync(mode):
    cfg = zotero_config()
    return zotero_sync.IncrementalSync(
        mode=mode, user_id=cfg.get("userId") or "0", api_key=cfg.get("apiKey") or "",
        server_id=cfg.get("serverId") or "", local_key=cfg.get("localKey") or "")


def csl_to_item(csl):
    """CSL-JSON -> HerPaper item（与 integrations.js 的 fromCSL 保持字段一致）。"""
    custom = csl.get("custom") or {}
    parts = ((csl.get("issued") or {}).get("date-parts") or [[None]])[0]
    authors = []
    for a in csl.get("author") or []:
        authors.append(a.get("literal") or " ".join(x for x in (a.get("given"), a.get("family")) if x))
    doi = str(csl.get("DOI") or "").replace("https://doi.org/", "").lower()
    return {
        "id": "z" + hashlib.sha1(str(csl.get("id", "")).encode()).hexdigest()[:12],
        "key": csl.get("id") or "", "title": csl.get("title", ""), "authors": authors,
        "year": str(parts[0]) if parts and parts[0] else "",
        "journal": csl.get("container-title", ""), "doi": doi, "pmid": "", "ut": custom.get("ut", ""),
        "type": csl.get("type", ""), "volume": csl.get("volume", ""), "issue": csl.get("issue", ""),
        "pages": csl.get("page", ""), "abstract": csl.get("abstract", ""),
        "citedBy": int(custom.get("citedByCount") or 0), "countsByYear": [],
        "fwci": custom.get("fwci"), "percentile": None, "concepts": [], "oaUrl": "",
        "url": csl.get("URL") or ("https://doi.org/" + doi if doi else ""),
        "oaId": custom.get("openalexId", ""), "related": [],
        "tags": [t.strip() for t in str(csl.get("keyword", "")).split(",") if t.strip()],
        "groups": custom.get("groups") or [], "starred": False, "read": False,
        "note": custom.get("note", ""), "version": int(custom.get("version") or 0),
        "synced": True, "addedAt": int(time.time() * 1000), "source": "Zotero",
    }


def merge_csl_into_library(csl_items, deleted_keys):
    """把一次增量拉取的结果合并进本机 state.json（按 key / DOI / 题名幂等）。"""
    state = read_json(STATE_FILE, empty_state())
    library = state.get("library") or []
    by_key, by_doi, by_title = {}, {}, {}
    for it in library:
        if it.get("key"):
            by_key[it["key"]] = it
        if it.get("doi"):
            by_doi[it["doi"]] = it
        t = "".join(ch for ch in str(it.get("title", "")).lower() if ch.isalnum())
        if t:
            by_title[t] = it
    added = updated = 0
    for csl in csl_items:
        fresh = csl_to_item(csl)
        t = "".join(ch for ch in fresh["title"].lower() if ch.isalnum())
        old = by_key.get(fresh["key"]) or by_doi.get(fresh["doi"]) or (by_title.get(t) if t else None)
        if old:
            for k, v in fresh.items():
                if k not in ("id", "addedAt") and v not in (None, "", []):
                    old[k] = v
            updated += 1
        else:
            library.append(fresh)
            by_key[fresh["key"]] = fresh
            if fresh["doi"]:
                by_doi[fresh["doi"]] = fresh
            added += 1
    removed = 0
    if deleted_keys:
        keys = set(deleted_keys)
        before = len(library)
        library = [it for it in library if it.get("key") not in keys]
        removed = before - len(library)
    state["library"] = library
    state["updatedAt"] = int(time.time() * 1000)
    write_json(STATE_FILE, state)
    return {"added": added, "updated": updated, "removed": removed, "total": len(library)}


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
            "User-Agent": "HerPaper/1.0 (local research tool; mailto:research@example.com)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        payload = resp.read().decode("utf-8", "replace")
    _cache[target] = (time.time(), payload)
    return payload


class Handler(BaseHTTPRequestHandler):
    server_version = "HerPaper/1.0"

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
            if p == "/zotero/status":
                probe = zotero_sync.probe_local()
                cfg = zotero_config()
                sst = read_json(SYNC_FILE, {"partitions": {}})
                parts = sst.get("partitions") or {}
                return self._json({
                    "available": bool(probe.get("running") and probe.get("enabled")),
                    "local": probe,
                    "webConfigured": bool(cfg.get("apiKey")),
                    "userId": cfg.get("userId") or "0",
                    "serverId": cfg.get("serverId") or probe.get("server_id") or "",
                    "localWriteAuthorized": bool(cfg.get("localKey")),
                    "partitions": {k: {"cursor": v.get("cursor", 0), "items": len(v.get("items") or {})}
                                   for k, v in parts.items()},
                    "spec": "Zotero Web API v3 / Local API 23119 - incremental sync by opaque version cursor",
                })
            if p == "/zotero/sync":
                mode = (qs.get("mode") or ["local"])[0]
                if mode not in ("local", "web"):
                    return self._json({"error": "mode must be local or web"}, 400)
                if mode == "web" and not zotero_config().get("apiKey"):
                    return self._json({"error": "Web API v3 需要 Zotero API Key，请先配置", "needConfig": True}, 200)
                probe = zotero_sync.probe_local()
                if mode == "local" and not (probe.get("running") and probe.get("enabled")):
                    return self._json({"error": "Zotero Local API 不可用",
                                       "hint": probe.get("hint") or "Zotero 桌面端未运行，或 Local API 未启用",
                                       "probe": probe}, 200)
                sync = make_sync(mode)
                sid = probe.get("server_id") if mode == "local" else "web"
                part = zotero_sync.partition_key(mode, sid, sync.prefix)
                sst = read_json(SYNC_FILE, {"partitions": {}})
                ps = (sst.get("partitions") or {}).get(part) or {"cursor": 0, "items": {}}
                stored = {k: (v.get("version", 0) if isinstance(v, dict) else v)
                          for k, v in (ps.get("items") or {}).items()}
                try:
                    res = sync.pull(ps.get("cursor", 0), stored)
                except zotero_sync.SyncError as exc:
                    return self._json({"error": str(exc), "status": exc.status}, 200)
                items = ps.get("items") or {}
                csls = []
                for obj in res["items"]:
                    k = obj.get("key")
                    if not k:
                        continue
                    items[k] = {"version": obj.get("version", 0), "csl": obj.get("csl")}
                    csls.append(obj.get("csl"))
                for k in res["deleted"]:
                    items.pop(k, None)
                sst.setdefault("partitions", {})[part] = {"cursor": res["cursor"], "items": items}
                write_json(SYNC_FILE, sst)
                merged = merge_csl_into_library(csls, res["deleted"])
                return self._json({"ok": True, "mode": mode, "partition": part,
                                   "cursor": res["cursor"], "pull": res["stats"], "merge": merged})
            if p == "/zotero/render":
                style = (qs.get("style") or ["apa"])[0]
                fmt = (qs.get("format") or ["bib"])[0]
                try:
                    out = make_sync("local").render(style, fmt)
                    return self._json({"ok": True, "style": style, "format": fmt, "result": out})
                except zotero_sync.SyncError as exc:
                    return self._json({"error": str(exc), "status": exc.status}, 200)
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
            if p == "/zotero/config":
                cfg = zotero_config()
                for k in ("userId", "apiKey", "localKey", "serverId"):
                    if k in body:
                        cfg[k] = str(body[k] or "")
                write_json(CONFIG_FILE, cfg)
                return self._json({"ok": True, "webConfigured": bool(cfg.get("apiKey")),
                                   "userId": cfg.get("userId"), "localWriteAuthorized": bool(cfg.get("localKey"))})
            if p == "/zotero/authorize":
                probe = zotero_sync.probe_local()
                if not probe.get("running"):
                    return self._json({"error": "Zotero 未运行，无法申请本地写入授权"}, 200)
                sid = probe.get("server_id") or ""
                st, _hd, payload = zotero_sync.request(
                    "http://127.0.0.1:23119/api/local/authorize", method="POST",
                    headers={"Zotero-Server-ID": sid},
                    body={"appName": body.get("appName") or "HerPaper"})
                if st == 200 and isinstance(payload, dict) and payload.get("key"):
                    cfg = zotero_config()
                    cfg["localKey"] = payload["key"]
                    cfg["serverId"] = sid
                    write_json(CONFIG_FILE, cfg)
                    return self._json({"ok": True, "remember": bool(payload.get("remember"))})
                return self._json({"error": "授权未完成：需在 Zotero 弹出的对话框点 Allow",
                                   "status": st, "payload": payload}, 200)
            if p.startswith("/zotero/push"):
                mode = (urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("mode") or ["local"])[0]
                items = body.get("items") or []
                cfg = zotero_config()
                if mode == "local" and not cfg.get("localKey"):
                    return self._json({"error": "本地写入需先在 Zotero 弹窗授权（点「授权写入」）", "needAuth": True}, 200)
                if mode == "web" and not cfg.get("apiKey"):
                    return self._json({"error": "Web API v3 需要 API Key", "needConfig": True}, 200)
                sync = make_sync(mode)
                sid = zotero_sync.probe_local().get("server_id") if mode == "local" else "web"
                sst = read_json(SYNC_FILE, {"partitions": {}})
                part = zotero_sync.partition_key(mode, sid, sync.prefix)
                cursor = ((sst.get("partitions") or {}).get(part) or {}).get("cursor", 0)
                try:
                    res = sync.push(items, cursor)
                except zotero_sync.SyncError as exc:
                    return self._json({"error": str(exc), "status": exc.status}, 200)
                if not res.get("conflict"):
                    ps = sst.setdefault("partitions", {}).setdefault(part, {"cursor": 0, "items": {}})
                    ps["cursor"] = res["cursor"]
                    write_json(SYNC_FILE, sst)
                return self._json({"ok": True, "mode": mode,
                                   "successfulCount": len(res.get("successful") or {}),
                                   "failed": res.get("failed"), "cursor": res.get("cursor"),
                                   "conflict": res.get("conflict", False)})
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
    print(f"HerPaper running at http://127.0.0.1:{port}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
