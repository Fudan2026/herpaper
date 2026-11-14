/* Node shims so the zero-build browser IIFEs can load under `node --test`.
 * The app attaches to window.PD; we run each source file in this context once
 * and hand the resulting PD namespace to the tests. No external deps. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function installShims() {
  const store = new Map();
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  global.location = {
    hostname: 'fudan2026.github.io',
    protocol: 'https:',
    pathname: '/herpaper/',
    search: '',
    origin: 'https://fudan2026.github.io',
  };
  // Minimal document: only what load-time code touches (element lookups are
  // null-safe in the app; PD.toast bails when #toast is missing).
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {}, click() {} }),
    body: { appendChild() {}, classList: { add() {} } },
    addEventListener() {},
  };
  // Node >= 21 ships a getter-only global navigator; never assign over it.
  if (!global.navigator) {
    Object.defineProperty(global, 'navigator', { value: { clipboard: null }, configurable: true, writable: true });
  }
  global.window = global;
}

let loaded = false;
function loadAppFiles(files) {
  if (loaded) return;
  installShims();
  for (const f of files || ['core.js', 'integrations.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInThisContext(src, { filename: f });
  }
  loaded = true;
}

/** Load core.js + integrations.js and return the PD namespace. */
function loadPD() {
  loadAppFiles();
  return global.window.PD;
}

function readRepoFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

module.exports = { loadPD, loadAppFiles, readRepoFile, ROOT };
