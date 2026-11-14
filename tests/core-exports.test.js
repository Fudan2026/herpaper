'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPD } = require('./helpers');

const PD = loadPD();

const LIB = [
  {
    id: 'p1', title: 'Deep learning',
    authors: ['LeCun, Yann', 'Bengio, Yoshua', 'Hinton, Geoffrey'],
    year: '2015', journal: 'Nature', volume: '521', issue: '7553', pages: '436-444',
    doi: '10.1038/nature14539', pmid: '26017442', citedBy: 40000,
    tags: ['deep learning', 'representation'], groups: [], url: 'https://doi.org/10.1038/nature14539',
  },
  {
    id: 'p2', title: 'The new frontier of genome engineering with CRISPR-Cas9',
    authors: ['Doudna, Jennifer A.', 'Charpentier, Emmanuelle'],
    year: '2014', journal: 'Science', volume: '346', pages: '1258096',
    doi: '10.1126/science.1258096', ut: 'WOS:000313661413004', citedBy: 5000,
    tags: [], groups: [], abstract: 'Genome editing with CRISPR.',
  },
];

/* ---------- RIS round trip ---------- */

test('exportRIS output re-parses losslessly via parseTagged', () => {
  const ris = PD.exportRIS(LIB);
  assert.ok(ris.includes('TY  - JOUR') && ris.includes('ER  - '));
  const back = PD.parseTagged(ris);
  assert.equal(back.length, 2);
  assert.equal(back[0].title, 'Deep learning');
  assert.deepEqual(back[0].authors, LIB[0].authors);
  assert.equal(back[0].doi, '10.1038/nature14539');
  assert.equal(back[0].journal, 'Nature');
  assert.equal(back[0].year, '2015');
  assert.equal(back[1].ut, 'WOS:000313661413004');
  assert.equal(back[1].abstract, 'Genome editing with CRISPR.');
});

/* ---------- BibTeX round trip ---------- */

test('exportBib output re-parses via parseBibtex with core fields intact', () => {
  const bib = PD.exportBib(LIB);
  assert.ok(bib.startsWith('@article{'));
  const back = PD.parseBibtex(bib);
  assert.equal(back.length, 2);
  assert.equal(back[0].title, 'Deep learning');
  assert.deepEqual(back[0].authors, LIB[0].authors);
  assert.equal(back[0].doi, '10.1038/nature14539');
  assert.equal(back[0].volume, '521');
  assert.equal(back[0].pages, '436-444');
  assert.equal(back[1].doi, '10.1126/science.1258096');
});

/* ---------- CSV round trip ---------- */

test('exportCSV output re-parses via parseCSV', () => {
  const csv = PD.exportCSV(LIB);
  const back = PD.parseCSV(csv);
  assert.equal(back.length, 2);
  assert.equal(back[0].title, 'Deep learning');
  // authors use "Last, Given" joined by "; " — CSV re-parse splits on commas
  // too, so assert on family-name tokens rather than exact structure.
  assert.equal(back[0].authors[0], 'LeCun');
  assert.ok(back[0].authors.includes('Geoffrey'));
  assert.equal(back[0].doi, '10.1038/nature14539');
  assert.equal(back[0].citedBy, 40000);
  assert.deepEqual(back[0].keywords, ['deep learning', 'representation']);
  assert.equal(back[1].ut, 'WOS:000313661413004');
});

/* ---------- CSL-JSON round trip (Zotero / citeproc interop) ---------- */

test('toCSL/fromCSL round-trips bibliographic identity', () => {
  const csl = LIB.map((it) => PD.toCSL(it));
  assert.equal(csl.length, 2);
  assert.equal(csl[0].type, 'article-journal');
  assert.equal(csl[0]['container-title'], 'Nature');
  assert.equal(csl[0].DOI, '10.1038/nature14539');
  assert.deepEqual(csl[0].author[0], { family: 'LeCun', given: 'Yann' });

  const items = csl.map(PD.fromCSL).filter(Boolean);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Deep learning');
  assert.deepEqual(items[0].authors, ['Yann LeCun', 'Yoshua Bengio', 'Geoffrey Hinton']);
  assert.equal(items[0].doi, '10.1038/nature14539');
  assert.equal(items[0].journal, 'Nature');
  assert.equal(items[0].volume, '521');
  assert.equal(items[0].pages, '436-444');
  assert.equal(items[0].citedBy, 40000);
});

test('toCSL splits bare full names into given/family', () => {
  const csl = PD.toCSL({ title: 'T', authors: ['Yann LeCun'] });
  assert.deepEqual(csl.author[0], { family: 'LeCun', given: 'Yann' });
});

test('exportCSL emits a valid CSL-JSON array; parseCSLText reads it back', () => {
  const text = PD.exportCSL(LIB);
  const arr = JSON.parse(text);
  assert.ok(PD.isCSLArray(arr));
  const items = PD.parseCSLText(text);
  assert.equal(items.length, 2);
});

/* ---------- HTML snapshot ---------- */

test('exportHTML produces a self-contained read-only snapshot', () => {
  const html = PD.exportHTML(LIB, 'My Library', 'note for collaborators');
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<h1>My Library</h1>'));
  assert.ok(html.includes('note for collaborators'));
  assert.ok(html.includes('Deep learning'));
  assert.ok(html.includes('https://doi.org/10.1038/nature14539'));
  // user content is escaped
  const bad = PD.exportHTML([{ title: '<script>alert(1)</script>', authors: [] }], 'X', '');
  assert.ok(!bad.includes('<script>alert(1)'));
});

/* ---------- keywords extraction ---------- */

test('keywords extracts meaningful terms and drops stop words', () => {
  const ks = PD.keywords(
    'Deep learning allows computational models that are composed of multiple processing layers to learn representations of data with multiple levels of abstraction. Learning method learning.',
    8
  );
  assert.ok(ks.includes('learning'));
  assert.ok(!ks.includes('the') && !ks.includes('with') && !ks.includes('that'));
  assert.ok(!ks.includes('method'), 'stop words like method must be dropped');
  const zh = PD.keywords('深度学习 通过 多层 表示 学习 方法 表示 数据', 6);
  assert.ok(zh.includes('深度学习'));
  assert.ok(!zh.includes('通过'));
});