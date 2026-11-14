'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { readRepoFile, ROOT } = require('./helpers');

/* ---------- referenced files exist (standalone integrity) ---------- */

function collectRefs(html) {
  const refs = new Set();
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const v = m[1];
    // ignore anchors, absolute URLs and protocol-relative links
    if (/^(#|\/|[a-z][a-z0-9+.-]*:|\/\/)/i.test(v)) continue;
    refs.add(v.replace(/^\.\//, '').split('?')[0].split('#')[0]);
  }
  return refs;
}

test('index.html references only files that ship in the repo', () => {
  const html = readRepoFile('index.html');
  for (const ref of collectRefs(html)) {
    assert.ok(
      fs.existsSync(path.join(ROOT, ref)),
      `index.html references "${ref}" but the file is missing`
    );
  }
});

test('promo.html references only files that ship in the repo', () => {
  const html = readRepoFile('promo.html');
  for (const ref of collectRefs(html)) {
    assert.ok(
      fs.existsSync(path.join(ROOT, ref)),
      `promo.html references "${ref}" but the file is missing`
    );
  }
});

/* ---------- supro sync contract ---------- */

test('every runtime file referenced by the app stays inside the supro sync set', () => {
  // The upstream sync (supro scripts/sync-herpaper.mjs) pulls exactly these
  // files from this repo. If the app grows a runtime dependency outside this
  // set, the supro.si embed breaks silently — so the contract is a test.
  const SYNCED = new Set([
    'index.html', 'style.css', 'core.js', 'app.js', 'integrations.js',
    'cloud-sync.js', 'herpaper-i18n.js', 'promo.html', 'promo.css',
    'serve.py', 'start.command', 'zotero_sync.py',
    'assets/herpaper-icon-512.png', 'assets/herpaper-icon-192.png',
    'assets/herpaper-icon-64.png', 'assets/herpaper-icon-32.png',
  ]);
  const html = readRepoFile('index.html');
  for (const ref of collectRefs(html)) {
    assert.ok(SYNCED.has(ref), `"${ref}" is referenced by the app but is NOT in the supro sync set`);
  }
});

/* ---------- escape helper (XSS posture of renderers) ---------- */

test('standalone PWA files ship in the repo (never required by the sync set)', () => {
  for (const f of ['manifest.webmanifest', 'sw.js', 'offline.html']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `missing standalone PWA file: ${f}`);
  }
});

test('PD.handleQuota exports an emergency backup on QuotaExceededError', () => {
  const { loadPD } = require('./helpers');
  const PD = loadPD();
  const downloads = [];
  const orig = PD.download;
  PD.download = (name, content) => downloads.push({ name, content });
  const toasts = [];
  const origToast = PD.toast;
  PD.toast = (m) => toasts.push(m);
  PD.state.library = [{ title: 'Deep learning', doi: '10.1038/nature14539' }];
  const err = new Error('exceeded'); err.name = 'QuotaExceededError';
  PD.handleQuota(err);
  assert.equal(downloads.length, 1);
  assert.ok(/emergency-backup/.test(downloads[0].name));
  assert.ok(JSON.parse(downloads[0].content).library.length === 1);
  assert.ok(toasts.some((t) => /存储已满|full/i.test(t)));
  PD.download = orig; PD.toast = origToast;
});