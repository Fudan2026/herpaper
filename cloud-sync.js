/* HerPaper cloud sync: SuPro account (Bearer JWT) <-> /api/herpaper/library.
 *
 * No new auth provider — reuses the SuPro session stored in
 * localStorage["supro.auth.session.v1"] (the HerPaper app is served same-origin
 * inside the SuPro shell on supro.si, so it can read the parent's session).
 *
 * OPT-IN BY DESIGN (owner requirement 2026-11-11): cloud sync is OFF by
 * default — local-first, zero cloud storage cost. The user flips it on in
 * view 02 (跨平台同步) via #btnCloudToggle; the choice persists in
 * localStorage["herpaper.cloudsync.enabled"]. Only when enabled AND signed in
 * does anything touch /api/herpaper/library.
 *
 * Loaded AFTER integrations.js (needs PD.toCSL / PD.fromCSL) and BEFORE app.js
 * (so it can wrap PD.init / PD.saveNow before app.js invokes them).
 *
 * Wire contract (see functions/api/herpaper/library.js + migrations/..._library.sql):
 *   GET    /api/herpaper/library            -> { items: [ { csl, item_key, ... } ] }
 *   POST   /api/herpaper/library  {items:[CSL]} -> { ok, saved }
 *   DELETE /api/herpaper/library?itemKey=K  -> 204
 * The DB stores item_key = csl.id, and PD.toCSL sets csl.id = it.key||it.doi||it.id,
 * so the local sync key is exactly (it.key || it.doi || it.id).
 */
(function () {
  'use strict';
  const PD = window.PD;
  if (!PD) return;

  const LS_SESSION = 'supro.auth.session.v1';
  const LS_ENABLED = 'herpaper.cloudsync.enabled';
  const API = '/api/herpaper/library';

  // Canonical sync key — must match the backend's stored item_key.
  const skey = it => (it && (it.key || it.doi || it.id)) || '';

  function token() {
    try {
      const raw = localStorage.getItem(LS_SESSION);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.access_token) return null;
      if (s.expires_at && s.expires_at * 1000 < Date.now()) return null; // expired
      return s.access_token;
    } catch (e) { return null; }
  }

  // The user's explicit choice. Default OFF — no cloud traffic without it.
  function syncEnabled() {
    try { return localStorage.getItem(LS_ENABLED) === '1'; } catch (e) { return false; }
  }

  function refreshCard() {
    const state = document.getElementById('cloudSyncState');
    const btn = document.getElementById('btnCloudToggle');
    if (state) {
      state.textContent = !syncEnabled()
        ? '未开启 · 仅本机保存'
        : (token() ? '已开启 · 云端自动同步' : '已开启 · 请先登录 SuPro');
    }
    if (btn) btn.textContent = syncEnabled() ? '关闭云端同步' : '开启云端同步';
  }

  function setEnabled(v) {
    try { localStorage.setItem(LS_ENABLED, v ? '1' : '0'); } catch (e) { /* ignore */ }
    refreshCard();
    if (v) { pull(); } else { setStatus('grey', '本地模式 · 云同步未开启'); }
  }

  function setStatus(kind, text) {
    const cls = { ok: 'green', warn: 'amber', grey: 'grey' };
    const dot = document.getElementById('statusDot');
    const txt = document.getElementById('statusText');
    const badge = document.getElementById('modeBadge');
    const hint = document.querySelector('.side-hint');
    if (dot) dot.className = 'dot ' + (cls[kind] || 'grey');
    if (txt) txt.textContent = text;
    if (badge) badge.textContent = text;
    if (hint && kind !== 'ok') {
      hint.textContent = syncEnabled() ? '未登录 SuPro · 仅本机保存' : '云同步未开启 · 仅本机保存';
    }
    refreshCard();
  }

  let cloudKeys = new Set();
  let applyingRemote = false;

  async function pull() {
    if (!syncEnabled()) { setStatus('grey', '本地模式 · 云同步未开启'); return; }
    const tk = token();
    if (!tk) { setStatus('warn', '本地模式 · 未登录 SuPro'); return; }
    try {
      const r = await fetch(API, { headers: { Authorization: 'Bearer ' + tk } });
      if (r.status === 401) { setStatus('warn', '登录已过期 · 请重登'); return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const remote = (d && Array.isArray(d.items)) ? d.items : [];
      const localMap = new Map(PD.state.library.map(x => [skey(x), x]));
      let added = 0, updated = 0;
      remote.forEach(row => {
        const csl = (row && row.csl) || row;
        const item = PD.fromCSL(csl);
        if (!item) return;
        const k = (row && row.item_key) || csl.id || item.id;
        item.id = k; item.key = k;          // stable round-trip key
        cloudKeys.add(k);
        if (localMap.has(k)) {
          const old = localMap.get(k);
          Object.assign(old, item, { id: k, key: k });
          updated++;
        } else { localMap.set(k, item); added++; }
      });
      PD.state.library = Array.from(localMap.values());
      cloudKeys = new Set(PD.state.library.map(skey));
      if (added || updated) {
        applyingRemote = true;              // guard: don't echo back to cloud
        try { PD.saveNow(); } finally { applyingRemote = false; }
        if (PD.onState) PD.onState();
      }
      setStatus('ok', '已同步云端 · ' + PD.state.library.length + ' 篇');
    } catch (e) {
      setStatus('warn', '云端拉取失败 · 本地模式');
    }
  }

  async function push() {
    if (applyingRemote || !syncEnabled()) return; // local-only unless opted in
    const tk = token();
    if (!tk) return;                        // local-only mode
    try {
      // soft-delete items removed since last sync
      const localKeys = new Set(PD.state.library.map(skey));
      const removed = [...cloudKeys].filter(k => !localKeys.has(k));
      for (const k of removed) {
        try {
          await fetch(API + '?itemKey=' + encodeURIComponent(k), {
            method: 'DELETE', headers: { Authorization: 'Bearer ' + tk }
          });
        } catch (e) { /* ignore single delete failure */ }
      }
      const items = PD.state.library.map(it => PD.toCSL(it)).filter(Boolean);
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
        body: JSON.stringify({ items })
      });
      if (r.status === 401) { setStatus('warn', '登录已过期 · 请重登'); return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      cloudKeys = localKeys;
      setStatus('ok', '已同步云端 · ' + PD.state.library.length + ' 篇');
    } catch (e) {
      setStatus('warn', '云端保存失败 · 已留本地');
    }
  }

  PD.CloudSync = {
    pull, push, token, setEnabled, syncEnabled,
    enabled: () => !!token() && syncEnabled(),
  };

  // Wrap persistence so every local change also mirrors to the cloud (opt-in only).
  const origSaveNow = PD.saveNow;
  PD.saveNow = async function () {
    await origSaveNow.apply(this, arguments);
    PD.CloudSync.push();
  };
  const origInit = PD.init;
  PD.init = async function () {
    const ok = await origInit.apply(this, arguments);
    PD.CloudSync.pull(); // internally no-ops when sync is off
    return ok;
  };

  // View-02 opt-in card (static markup, survives app.js re-renders).
  const toggle = document.getElementById('btnCloudToggle');
  if (toggle) toggle.addEventListener('click', () => setEnabled(!syncEnabled()));
  refreshCard();

  // Light multi-device sync while a session is active AND sync is enabled.
  // The interval registers with PD_HERPAPER_TEARDOWN so a route remount clears it.
  if (typeof setInterval === 'function') {
    const syncTimer = setInterval(() => { if (PD.CloudSync.enabled()) PD.CloudSync.pull(); }, 60000);
    (window.PD_HERPAPER_TEARDOWN = window.PD_HERPAPER_TEARDOWN || []).push(function () { clearInterval(syncTimer); });
  }
})();
