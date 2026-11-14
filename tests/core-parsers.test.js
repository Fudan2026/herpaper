'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPD } = require('./helpers');

const PD = loadPD();

/* ---------- normDOI / keyOf ---------- */

test('normDOI strips doi.org prefix, doi: prefix, spaces and case', () => {
  assert.equal(PD.normDOI('https://doi.org/10.1038/nature14539'), '10.1038/nature14539');
  assert.equal(PD.normDOI('http://dx.doi.org/10.1126/SCIENCE.1258096'), '10.1126/science.1258096');
  assert.equal(PD.normDOI('doi: 10.1038/nbt.3439'), '10.1038/nbt.3439');
  assert.equal(PD.normDOI(' 10.1093/nar/gkaa1077 '), '10.1093/nar/gkaa1077');
  assert.equal(PD.normDOI(''), '');
});

test('keyOf prefers normalized doi, falls back to normalized title', () => {
  assert.equal(PD.keyOf({ doi: 'https://doi.org/10.1038/nature14539', title: 'x' }), 'doi:10.1038/nature14539');
  assert.equal(PD.keyOf({ title: 'Deep Learning! (review)' }), 'ti:deeplearningreview');
});

/* ---------- RIS (EndNote / Zotero) ---------- */

const RIS = [
  'TY  - JOUR',
  'AU  - Doudna, Jennifer A.',
  'AU  - Charpentier, Emmanuelle',
  'TI  - The new frontier of genome engineering with CRISPR-Cas9',
  'JO  - Science',
  'PY  - 2014',
  'VL  - 346',
  'IS  - 6213',
  'SP  - 1258096',
  'DO  - 10.1126/science.1258096',
  'AB  - The emergence of affordable genome-editing technology.',
  'ER  - ',
].join('\n');

test('parseTagged parses RIS records into items', () => {
  const items = PD.parseTagged(RIS);
  assert.equal(items.length, 1);
  const it = items[0];
  assert.equal(it.title, 'The new frontier of genome engineering with CRISPR-Cas9');
  assert.deepEqual(it.authors, ['Doudna, Jennifer A.', 'Charpentier, Emmanuelle']);
  assert.equal(it.year, '2014');
  assert.equal(it.journal, 'Science');
  assert.equal(it.volume, '346');
  assert.equal(it.issue, '6213');
  assert.equal(it.doi, '10.1126/science.1258096');
  assert.equal(it.abstract, 'The emergence of affordable genome-editing technology.');
});

test('parseTagged splits multiple RIS records on ER', () => {
  const ris2 = [
    'TY  - JOUR',
    'AU  - Cong, L',
    'TI  - Multiplex Genome Engineering Using CRISPR/Cas Systems',
    'JO  - Science',
    'PY  - 2013',
    'DO  - 10.1126/science.1231143',
    'ER  - ',
  ].join('\n');
  const items = PD.parseTagged(RIS + '\n\n' + ris2);
  assert.equal(items.length, 2);
  assert.notEqual(items[0].doi, items[1].doi);
  assert.equal(items[1].doi, '10.1126/science.1231143');
});

/* ---------- WoS tagged export (.txt, "PT J" style) ---------- */

const WOS = [
  'PT J',
  'AU Cong, L',
  'AU Ran, FA',
  'TI Multiplex Genome Engineering Using CRISPR/Cas Systems',
  'SO SCIENCE',
  'PY 2013',
  'VL 339',
  'IS 6121',
  'BP 819',
  'EP 823',
  'DI 10.1126/science.1231143',
  'UT WOS:000313661413004',
  'TC 5000',
  'ER',
].join('\n');

test('parseTagged parses WoS tagged exports and keeps the UT accession number', () => {
  const items = PD.parseTagged(WOS);
  assert.equal(items.length, 1);
  const it = items[0];
  assert.equal(it.title, 'Multiplex Genome Engineering Using CRISPR/Cas Systems');
  assert.deepEqual(it.authors, ['Cong, L', 'Ran, FA']);
  assert.equal(it.journal, 'SCIENCE');
  assert.equal(it.pages, '819-823');
  assert.equal(it.ut, 'WOS:000313661413004');
  assert.equal(it.citedBy, 5000);
});

/* ---------- BibTeX ---------- */

const BIB = [
  '@article{lecun2015deep,',
  '  title     = {Deep learning},',
  '  author    = {LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey},',
  '  journal   = {Nature},',
  '  year      = {2015},',
  '  volume    = {521},',
  '  number    = {7553},',
  '  pages     = {436--444},',
  '  doi       = {10.1038/nature14539},',
  '}',
].join('\n');

test('parseBibtex extracts fields, authors (and-split) and year', () => {
  const items = PD.parseBibtex(BIB);
  assert.equal(items.length, 1);
  const it = items[0];
  assert.equal(it.title, 'Deep learning');
  assert.deepEqual(it.authors, ['LeCun, Yann', 'Bengio, Yoshua', 'Hinton, Geoffrey']);
  assert.equal(it.journal, 'Nature');
  assert.equal(it.year, '2015');
  assert.equal(it.volume, '521');
  assert.equal(it.pages, '436--444');
  assert.equal(it.doi, '10.1038/nature14539');
  assert.equal(it.type, 'article');
});

test('parseBibtex tolerates quoted values and skips entries without a title', () => {
  const bib = '@article{a, title = "Quoted Title", year = "2020"}\n@misc{b, note = {no title here}}';
  const items = PD.parseBibtex(bib);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Quoted Title');
  assert.equal(items[0].year, '2020');
});

/* ---------- CSV ---------- */

test('parseCSV reads WoS-style csv headers case-insensitively', () => {
  const csv = [
    'Publication Year,Authors,Article Title,Journal Name,DOI,Volume,Issue,Starting Page,Ending Page,Times Cited,Author Keywords',
    '2015,"LeCun, Y; Bengio, Y; Hinton, G",Deep learning,Nature,10.1038/nature14539,521,7553,436,444,10000,"deep nets;representation learning"',
    '2014,"Doudna, JA; Charpentier, E",The new frontier of genome engineering with CRISPR-Cas9,Science,10.1126/science.1258096,346,6213,1,9,5000,CRISPR',
  ].join('\n');
  const items = PD.parseCSV(csv);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Deep learning');
  // CSV author cells use "Last, F; Last2, F2" and the parser splits on every
  // comma/semicolon — name tokens survive, the comma structure does not.
  assert.equal(items[0].authors[0], 'LeCun');
  assert.equal(items[0].authors.filter((a) => a === 'Hinton').length, 1);
  assert.equal(items[0].doi, '10.1038/nature14539');
  assert.equal(items[0].citedBy, 10000);
  assert.deepEqual(items[0].keywords, ['deep nets', 'representation learning']);
});

test('parseCSV handles quoted commas and returns [] without a title column', () => {
  const csv = 'Authors,Year\n"A, B",2020';
  assert.deepEqual(PD.parseCSV(csv), []);
  const csv2 = 'Title,Authors\n"Hello, world","A, B"';
  const items = PD.parseCSV(csv2);
  assert.equal(items[0].title, 'Hello, world');
});

/* ---------- parseAny dispatch ---------- */

test('parseAny dispatches by extension: .json state, .bib, .csv, DOI lists', () => {
  const state = JSON.stringify({ library: [{ title: 'Deep learning', doi: '10.1038/nature14539', authors: ['LeCun, Yann'] }], groups: [] });
  const r1 = PD.parseAny(state, 'backup.json');
  assert.equal(r1.items.length, 1);
  assert.ok(r1.state && Array.isArray(r1.state.library));

  const r2 = PD.parseAny(BIB, 'refs.bib');
  assert.equal(r2.items.length, 1);

  const r3 = PD.parseAny('Title,Authors\n"Hello, world","A, B"', 'list.csv');
  assert.equal(r3.items.length, 1);

  const r4 = PD.parseAny('10.1038/nature14539\nhttps://doi.org/10.1126/science.1258096', 'dois.txt');
  assert.deepEqual(r4.dois, ['10.1038/nature14539', 'https://doi.org/10.1126/science.1258096']);
  assert.equal(r4.items.length, 0);

  const r5 = PD.parseAny('some unrecognizable plain text', 'x.txt');
  assert.ok(r5.error);
});

/* ---------- addItems dedup/merge ---------- */

test('addItems merges on the same DOI instead of duplicating, and enriches blank fields', () => {
  PD.state.library = [];
  const a = { title: 'Deep learning', doi: '10.1038/nature14539', authors: ['LeCun, Yann'], year: '2015' };
  const b = { title: 'Deep learning', doi: 'https://doi.org/10.1038/NATURE14539', journal: 'Nature', citedBy: 10000 };
  const r = PD.addItems([a, b]);
  assert.equal(PD.state.library.length, 1);
  assert.equal(r.added, 1);
  assert.equal(r.updated, 1);
  assert.equal(PD.state.library[0].journal, 'Nature');
  assert.equal(PD.state.library[0].citedBy, 10000);
  assert.deepEqual(PD.state.library[0].authors, ['LeCun, Yann']);
});

test('addItems skips entries without a title', () => {
  PD.state.library = [];
  PD.addItems([{ doi: '10.0000/x' }, { title: 'Only titled survive', doi: '' }]);
  assert.equal(PD.state.library.length, 1);
});