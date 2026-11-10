#!/usr/bin/env python3
"""HerPaper / Zotero 增量同步引擎（Web API v3 + Local API）。

依据 Zotero 官方文档实现：
  https://www.zotero.org/support/dev/web_api/v3/syncing
  https://www.zotero.org/support/dev/web_api/v3/local_api
  https://www.zotero.org/support/dev/web_api/v3/write_requests

要点：
- version 是单调递增但不透明、不连续的整数；不得自行推算。
- 每个同步目标按 (mode, server_id, prefix) 分区存游标，Local API 的本地版本
  与 Web API 版本毫无关系，必须隔离。
- 读：?since=<cursor>&format=versions → key→version 差异 → 每批 <=50 按 key 拉取。
- 删除：<prefix>/deleted?since=<cursor> 返回墓碑。
- 写：If-Unmodified-Since-Version 或每个对象 JSON version；缺前置条件 428，冲突 412。
- Local API：读免鉴权；写需 Zotero-Server-ID + 运行时申请的 Zotero-API-Key。
- 内部交换格式统一为 CSL-JSON，避免被 Zotero 的 itemType 体系锁死。
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

LOCAL_BASE = "http://127.0.0.1:23119/api"
WEB_BASE = "https://api.zotero.org"
BATCH = 50  # 官方文档：按 key 拉取每次最多 50 个

# 本机请求必须绕开系统 HTTP_PROXY：否则代理会把 127.0.0.1 也拦下，
# 返回一个 HTTP 200 的 "upstream connect failed" 文本，造成误判。
NO_PROXY_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "[::1]"}


class SyncError(Exception):
    def __init__(self, message, status=0, payload=None):
        super().__init__(message)
        self.status = status
        self.payload = payload


def request(url, method="GET", headers=None, body=None, timeout=30):
    """返回 (status, headers, parsed_json_or_text)。保留响应头，供版本游标使用。"""
    hdr = {"Accept": "application/json", "User-Agent": "HerPaper/1.0"}
    if headers:
        hdr.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdr["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdr, method=method)
    try:
        host = urllib.parse.urlparse(url).hostname
        opener = NO_PROXY_OPENER if host in LOCAL_HOSTS else urllib.request
        with opener.open(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            try:
                parsed = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                parsed = raw
            return resp.status, dict(resp.headers), parsed
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = raw
        return exc.code, dict(exc.headers), parsed
    except urllib.error.URLError as exc:
        raise SyncError("无法连接 " + url + ": " + str(exc.reason)) from exc


def probe_local():
    """探测本机 Zotero Local API（23119）。未运行 / 未启用 / 已启用 三态。"""
    try:
        status, headers, payload = request(LOCAL_BASE + "/", timeout=4)
    except SyncError as exc:
        return {"running": False, "enabled": False, "reason": str(exc)}
    if status == 403:
        return {"running": True, "enabled": False,
                "hint": "Zotero → Settings → Advanced → Allow other applications on this computer to communicate with Zotero"}
    return {
        "running": True,
        "enabled": status < 400,
        "api_version": headers.get("Zotero-API-Version", "3"),
        "server_id": headers.get("Zotero-Server-ID"),
        "schema_version": headers.get("Zotero-Schema-Version"),
        "payload": payload,
    }


# ---------- CSL-JSON <-> Zotero item JSON ----------
TYPE_TO_CSL = {
    "journalArticle": "article-journal", "book": "book", "bookSection": "chapter",
    "conferencePaper": "paper-conference", "thesis": "thesis", "report": "report",
    "webpage": "webpage", "dataset": "dataset", "preprint": "manuscript",
    "magazineArticle": "article-magazine", "newspaperArticle": "article-newspaper",
}
CSL_TO_TYPE = {v: k for k, v in TYPE_TO_CSL.items()}


def zotero_to_csl(data):
    """Zotero data object → CSL-JSON item。"""
    creators = []
    for c in data.get("creators") or []:
        if c.get("name"):
            creators.append({"literal": c["name"]})
        else:
            creators.append({"family": c.get("lastName", ""), "given": c.get("firstName", "")})
    year = None
    for token in (data.get("date") or "").replace("/", "-").split("-"):
        if len(token) == 4 and token.isdigit():
            year = int(token)
            break
    csl = {
        "id": data.get("key") or data.get("DOI") or data.get("title", ""),
        "type": TYPE_TO_CSL.get(data.get("itemType"), "article-journal"),
        "title": data.get("title", ""),
        "author": creators,
        "DOI": data.get("DOI") or None,
        "URL": data.get("url") or None,
        "abstract": data.get("abstractNote") or None,
        "publisher": data.get("publisher") or None,
        "volume": data.get("volume") or None,
        "issue": data.get("issue") or None,
        "page": data.get("pages") or None,
        "keyword": ", ".join(t.get("tag", "") for t in (data.get("tags") or [])),
    }
    for src, dst in (("publicationTitle", "container-title"), ("proceedingsTitle", "container-title"),
                     ("bookTitle", "container-title"), ("university", "publisher"), ("ISBN", "ISBN"),
                     ("ISSN", "ISSN"), ("language", "language")):
        if data.get(src):
            csl[dst] = data[src]
    if year:
        csl["issued"] = {"date-parts": [[year]]}
    csl["custom"] = {"zoteroKey": data.get("key"), "version": data.get("version", 0),
                     "dateModified": data.get("dateModified"), "itemType": data.get("itemType")}
    return {k: v for k, v in csl.items() if v not in (None, "", [])}


def csl_to_zotero(csl, version=None):
    """CSL-JSON item → Zotero write payload（data 部分）。"""
    authors = []
    for a in csl.get("author") or []:
        if a.get("literal"):
            authors.append({"creatorType": "author", "name": a["literal"]})
        else:
            authors.append({"creatorType": "author", "firstName": a.get("given", ""),
                            "lastName": a.get("family", "")})
    year = ""
    parts = ((csl.get("issued") or {}).get("date-parts") or [[None]])[0]
    if parts and parts[0]:
        year = str(parts[0])
    data = {
        "itemType": CSL_TO_TYPE.get(csl.get("type"), "journalArticle"),
        "title": csl.get("title", ""),
        "creators": authors,
        "publicationTitle": csl.get("container-title", ""),
        "date": year,
        "DOI": csl.get("DOI", ""),
        "url": csl.get("URL", ""),
        "abstractNote": csl.get("abstract", ""),
        "volume": csl.get("volume", ""),
        "issue": csl.get("issue", ""),
        "pages": csl.get("page", ""),
        "tags": [{"tag": t.strip()} for t in str(csl.get("keyword", "")).split(",") if t.strip()],
        "collections": [],
        "relations": {},
    }
    if version is not None:
        data["version"] = version
    return data


# ---------- 增量同步 ----------
def partition_key(mode, server_id, prefix):
    return "|".join([mode, server_id or "-", prefix])


class IncrementalSync:
    """实现官方文档的 full-library sync 拉取侧 + 上传侧。"""

    def __init__(self, mode="local", user_id="0", api_key="", server_id="", local_key=""):
        self.mode = mode
        self.base = LOCAL_BASE if mode == "local" else WEB_BASE
        self.prefix = ("/users/" + str(user_id)) if mode == "local" else ("/users/" + str(user_id))
        self.api_key = api_key
        self.server_id = server_id
        self.local_key = local_key
        self.last_lmv = None

    def _headers(self, extra=None):
        h = {}
        if self.mode == "web" and self.api_key:
            h["Zotero-API-Key"] = self.api_key
        if self.mode == "local":
            if self.server_id:
                h["Zotero-Server-ID"] = self.server_id
            if self.local_key:
                h["Zotero-API-Key"] = self.local_key
        if extra:
            h.update(extra)
        return h

    def _get(self, path, params=None, extra_headers=None):
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        return request(url, headers=self._headers(extra_headers))

    def _lmv(self, headers):
        v = headers.get("Last-Modified-Version")
        return int(v) if v and str(v).isdigit() else None

    def pull(self, cursor=0, stored=None, max_restarts=3):
        """返回 {items, deleted, cursor, stats, need_reset}。stored 为 {key: version}。"""
        stored = stored or {}
        for attempt in range(max_restarts):
            status, headers, versions = self._get(
                self.prefix + "/items",
                {"since": cursor, "format": "versions", "includeTrashed": "1"},
                {"If-Modified-Since-Version": str(cursor)},
            )
            if status == 304:
                return {"items": [], "deleted": [], "cursor": cursor, "stats": {"unchanged": True}}
            if status >= 400:
                raise SyncError("增量版本请求失败 " + str(status), status, versions)
            first_lmv = self._lmv(headers) or cursor
            if not isinstance(versions, dict):
                versions = {}
            queued = [k for k, v in versions.items() if int(v) != int(stored.get(k, -1))]
            items, inconsistent = [], False
            for i in range(0, len(queued), BATCH):
                chunk = queued[i:i + BATCH]
                st, hd, payload = self._get(self.prefix + "/items",
                                            {"itemKey": ",".join(chunk), "includeTrashed": "1"})
                if st >= 400:
                    raise SyncError("按 key 批量拉取失败 " + str(st), st, payload)
                lmv = self._lmv(hd)
                if lmv is not None and lmv != first_lmv:
                    inconsistent = True  # 官方文档：并发远端更新，需重启
                    break
                for obj in payload or []:
                    if obj.get("key") and obj["key"] not in chunk:
                        continue  # 只接受本次按 key 请求的对象
                    data = obj.get("data", obj)
                    items.append({"key": obj.get("key") or data.get("key"),
                                  "version": obj.get("version") or data.get("version", 0),
                                  "csl": zotero_to_csl(data), "raw": data})
            if inconsistent:
                continue
            st, hd, deleted = self._get(self.prefix + "/deleted", {"since": cursor})
            if st >= 400 and st != 404:
                raise SyncError("删除墓碑请求失败 " + str(st), st, deleted)
            tombstones = ((deleted or {}).get("items", []) if isinstance(deleted, dict) else [])
            new_cursor = self._lmv(hd) or first_lmv
            return {
                "items": items, "deleted": tombstones, "cursor": new_cursor,
                "stats": {"versions_returned": len(versions), "queued": len(queued),
                          "downloaded": len(items), "deleted": len(tombstones),
                          "restarts": attempt, "concurrent_detected": inconsistent},
            }
        raise SyncError("远端持续并发更新，超过重试次数")

    def push(self, items, cursor=0, deletions=None):
        """上传本地改动。items 为 CSL-JSON 列表；返回 {successful, unchanged, failed, cursor, conflict}。"""
        if not items and not deletions:
            return {"successful": [], "unchanged": [], "failed": [], "cursor": cursor, "conflict": False}
        payload = [csl_to_zotero(c, c.get("custom", {}).get("version")) for c in items]
        headers = self._headers({"If-Unmodified-Since-Version": str(cursor),
                                 "Zotero-Write-Token": "herpaper-" + str(cursor)})
        status, hd, resp = request(self.base + self.prefix + "/items", method="POST",
                                   headers=headers, body=payload)
        if status == 412:
            return {"successful": [], "unchanged": [], "failed": [], "cursor": cursor, "conflict": True}
        if status == 428:
            raise SyncError("写请求缺少版本前置条件（428）", status, resp)
        if status >= 400:
            raise SyncError("上传失败 " + str(status), status, resp)
        result = resp if isinstance(resp, dict) else {}
        return {"successful": result.get("successful", {}), "unchanged": result.get("unchanged", {}),
                "failed": result.get("failed", {}), "cursor": self._lmv(hd) or cursor,
                "conflict": False}

    def render(self, style="apa", fmt="bib", keys=None):
        """委托 Zotero 的 citeproc 渲染任意 CSL 样式（无需自己实现格式化器）。"""
        params = {"format": fmt, "style": style}
        if keys:
            params["itemKey"] = ",".join(keys[:BATCH])
        status, _, payload = self._get(self.prefix + "/items", params)
        if status >= 400:
            raise SyncError("格式化渲染失败 " + str(status), status, payload)
        return payload


def load_state(path):
    p = Path(path)
    if not p.exists():
        return {"partitions": {}, "delete_log": [], "pristine": {}}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {"partitions": {}, "delete_log": [], "pristine": {}}


def save_state(path, state):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    tmp.replace(p)


if __name__ == "__main__":
    print(json.dumps(probe_local(), ensure_ascii=False, indent=2))
