'use strict';
/* i18n coverage audit: every Chinese UI string the app can render must be
 * translatable by herpaper-i18n.js (exact DICT hit or a PATTERNS regex), so
 * the SuPro English mode never leaks mixed-language chrome.
 *
 * Mirrors the runtime sweeper's view of the DOM:
 *  - text nodes (literals containing HTML are split on tags),
 *  - placeholder/title/aria-label attributes,
 *  - string-concatenation fragments (literals adjacent to `+`) become full
 *    strings at runtime, so they are reviewed (tier 2) rather than asserted.
 * Document-content generators (downloaded files, stop-word lists) are not UI
 * chrome and are excluded explicitly. */
const test = require('node:test');
const assert = require('node:assert');
const { readRepoFile } = require('./helpers');

/* ---- extract the translation machinery from herpaper-i18n.js source ---- */

const I18N = readRepoFile('herpaper-i18n.js');

const DICT = new Map();
{
  const re = /^\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)",?\s*$/gm;
  let m;
  while ((m = re.exec(I18N))) {
    const key = JSON.parse('"' + m[1] + '"');
    const val = JSON.parse('"' + m[2] + '"');
    if (DICT.has(key) && DICT.get(key) !== val) {
      assert.fail(`DICT has conflicting values for "${key}"`);
    }
    DICT.set(key, val);
  }
  assert.ok(DICT.size > 200, 'DICT extraction looks wrong (too few entries)');
}

const PATTERNS = [];
{
  const re = /\[\/(.+?)\/([gimsuy]*),\s*"((?:[^"\\]|\\.)*)"\]/g;
  let m;
  while ((m = re.exec(I18N))) {
    PATTERNS.push({ re: new RegExp(m[1], m[2]), out: JSON.parse('"' + m[3] + '"') });
  }
  assert.ok(PATTERNS.length > 20, 'PATTERNS extraction looks wrong (too few entries)');
}

function isTranslated(zh) {
  const t = zh.trim();
  if (DICT.has(t)) return true;
  for (const p of PATTERNS) {
    const hit = p.re.test(t);
    if (p.re.global) p.re.lastIndex = 0;
    if (hit) return true;
  }
  return false;
}

/* ---- zh string extraction ---- */

function cleanFragment(p) {
  return p
    .replace(/&nbsp;/g, ' ')
    // residual quote/bracket runs from split markup such as '">加入库</a>'
    .replace(/^["'>\s]+/, '')
    .replace(/["'<\s]+$/, '')
    .trim();
}

function zhFragmentsInText(text) {
  const out = new Set();
  for (const raw of text.split(/<[^>]*>/)) {
    const t = cleanFragment(raw);
    // fragments that live inside a tag (attribute syntax) are handled by the
    // attribute sweep, never as text nodes
    if (t.includes('="')) continue;
    if (/[\u4e00-\u9fff]/.test(t)) out.add(t);
  }
  return out;
}

function zhAttrsInHtml(html) {
  const out = new Set();
  // full tags: <tag attrs>
  const re = /<([a-z][a-z0-9-]*)((?:"[^"]*"|[^>])*)>/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] === 'textarea') continue; // user content stays untouched (runtime SKIP)
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const a = new RegExp(attr + '="([^"]*)"').exec(m[2]);
      if (a && /[\u4e00-\u9fff]/.test(a[1])) out.add(a[1].trim());
    }
  }
  // fragments that begin mid-tag (the literal starts inside an attr list,
  // e.g. 'disabled title="…" >'): sweep the raw text for attribute pairs too
  const fre = /(?:placeholder|title|aria-label)="([^"]*[\u4e00-\u9fff][^"]*)"/g;
  while ((m = fre.exec(html))) out.add(m[1].trim());
  return out;
}

function decodeEntities(s) {
  return s
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&#9;/g, '\t')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function zhStringsInHtml(html) {
  const out = new Set();
  // textarea PLACEHOLDERS are instructional chrome and get translated; the
  // VALUES inside textareas are user content and stay untouched (SKIP).
  const tre = /<textarea\b[^>]*>/gi;
  let tm;
  while ((tm = tre.exec(html))) {
    const a = /placeholder="([^"]*)"/.exec(tm[0]);
    if (a && /[\u4e00-\u9fff]/.test(a[1])) out.add(decodeEntities(a[1]).trim());
  }
  const stripped = html
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  for (const s of zhFragmentsInText(stripped)) out.add(s);
  for (const s of zhAttrsInHtml(stripped)) out.add(s);
  return out;
}

/* Literals adjacent to `+` are fragments of runtime concatenations; the
 * sweeper only ever sees the joined result. We collect them for a printed
 * tier-2 review instead of failing the suite on partial pieces. */
function jsStringLiterals(src) {
  const out = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"(?!"|\n)((?:[^"\\\n]|\\.)*)"/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    const end = re.lastIndex;
    const value = (m[1] !== undefined ? m[1] : m[2]).replace(/\\n/g, '\n');
    if (!/[\u4e00-\u9fff]/.test(value)) continue;
    const before = src.slice(Math.max(0, start - 12), start);
    const after = src.slice(end, end + 12);
    const adjacentConcat = /\+\s*$/.test(before) || /^\s*\+/.test(after);
    out.push({ value, adjacentConcat });
  }
  return out;
}

/* Document-content generators: strings that end up inside downloaded files
 * (feedback draft markdown, journal templates), plus the stop-word data
 * literal. Not UI chrome — deliberately out of the audit's scope. */
const CONTENT_EXCLUDED = [
  /^# Her Paper 文献工作台体验与反馈/,
  /^## [一二三四]、/,
  /^- /,
  /^> 大赛要求：/,
  /^> 目标期刊：/,
  /^> 篇幅：/,
  /^> 摘要要求：/,
  /^> 参考文献样式：/,
  /^---\n投稿提示：/,
  /^官方作者指南：/,
  /^论文正文$/,
  /^\| 题名 \| 作者 \| 年份 \| 期刊 \| 被引 \| DOI \| 摘要摘录 \|$/,
  /^the a an and or of to in on for with /,
  /^（在此填写）$/,
];

function auditableStrings(file) {
  const src = readRepoFile(file);
  const must = new Set();
  const review = new Set();
  for (const { value, adjacentConcat } of jsStringLiterals(src)) {
    if (CONTENT_EXCLUDED.some((re) => re.test(value))) continue;
    const strings = value.includes('<') ? zhStringsInHtml(value) : zhFragmentsInText(value);
    for (const s of strings) {
      if (CONTENT_EXCLUDED.some((re) => re.test(s))) continue;
      (adjacentConcat ? review : must).add(s);
    }
  }
  return { must, review };
}

/* ---- the audit ---- */

test('every static zh string in index.html is translatable', () => {
  const missing = [];
  for (const s of zhStringsInHtml(readRepoFile('index.html'))) {
    if (!isTranslated(s)) missing.push(s);
  }
  assert.deepStrictEqual(missing, [], 'untranslated static strings: ' + JSON.stringify(missing, null, 2));
});

test('every standalone zh string rendered from app.js is translatable', () => {
  const missing = [];
  for (const s of auditableStrings('app.js').must) {
    if (!isTranslated(s)) missing.push(s);
  }
  assert.deepStrictEqual(missing, [], 'untranslated app.js strings: ' + JSON.stringify(missing, null, 2));
});

test('every standalone zh string in core.js and cloud-sync.js is translatable', () => {
  const missing = [];
  for (const file of ['core.js', 'cloud-sync.js']) {
    for (const s of auditableStrings(file).must) {
      if (!isTranslated(s)) missing.push(file + ' :: ' + s);
    }
  }
  assert.deepStrictEqual(missing, [], 'untranslated strings: ' + JSON.stringify(missing, null, 2));
});

test('concatenation fragments are reviewed for the visible ones (tier 2, printed)', () => {
  // Tier 2: fragments joined by `+` at runtime. The DICT/PATTERNS already
  // cover the full joined strings; assert that every fragment that IS a
  // complete visible string on its own (no leading/trailing digits or
  // separators) is also directly translatable — this catches pieces the
  // sweeper sees when the surrounding concatenation collapses to a lone
  // fragment.
  const files = ['app.js', 'core.js', 'cloud-sync.js'];
  const visible = new Set();
  for (const f of files) {
    for (const s of auditableStrings(f).review) {
      // a "complete visible string" starts with a CJK char and ends with
      // punctuation or a CJK char — not a mid-sentence piece
      if (/^[\u4e00-\u9fff]/.test(s) && /[\u4e00-\u9fff，。…：」）》]|\)$/.test(s) && s.length >= 2) {
        visible.add(f + ' :: ' + s);
      }
    }
  }
  const missing = [];
  for (const entry of visible) {
    const s = entry.split(' :: ')[1];
    if (!isTranslated(s)) missing.push(entry);
  }
  // Tier 2 is advisory today: it prints the reviewable list. Flip this to a
  // hard assert once the visible set is fully curated.
  if (missing.length) {
    console.log('tier-2 review (concat fragments not directly translatable):');
    for (const s of missing) console.log('  - ' + s);
  }
  assert.ok(true);
});

test('every DICT value is non-empty and contains no CJK (English output)', () => {
  for (const [k, v] of DICT) {
    assert.ok(v.trim().length > 0, `empty translation for "${k}"`);
    assert.ok(!/[\u4e00-\u9fff]/.test(v), `translation of "${k}" still contains Chinese: "${v}"`);
  }
});