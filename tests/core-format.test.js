'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPD } = require('./helpers');

const PD = loadPD();

/* A real, well-known paper used as the shared fixture (Doudna & Charpentier 2014). */
const DOUDNA = {
  id: 'p1',
  title: 'The new frontier of genome engineering with CRISPR-Cas9',
  authors: ['Doudna, Jennifer A.', 'Charpentier, Emmanuelle'],
  year: '2014',
  journal: 'Science',
  volume: '346',
  issue: '6213',
  pages: '1258096',
  doi: '10.1126/science.1258096',
  type: 'article',
};

/* ---------- formatRef: all seven styles ---------- */

test('formatRef GB/T 7714-2015 numeric style', () => {
  const s = PD.formatRef(DOUDNA, 'gbt7714');
  assert.equal(
    s,
    'DOUDNA J A, CHARPENTIER E. The new frontier of genome engineering with CRISPR-Cas9[J]. Science, 2014, 346(6213): 1258096. DOI:10.1126/science.1258096.'
  );
});

test('formatRef GB/T appends 等 after three authors for Chinese papers', () => {
  const zh = { title: '深度学习综述', authors: ['张三', '李四', '王五', '赵六'], year: '2020', journal: '计算机学报', volume: '43', pages: '1-20' };
  const s = PD.formatRef(zh, 'gbt7714');
  assert.ok(s.startsWith('张三, 李四, 王五, 等. 深度学习综述[J].'));
});

test('formatRef APA 7th', () => {
  const s = PD.formatRef(DOUDNA, 'apa');
  assert.equal(
    s,
    'Doudna, J. A., & Charpentier, E. (2014). The new frontier of genome engineering with CRISPR-Cas9. <em>Science</em>, <em>346</em>(6213), 1258096. <a href="https://doi.org/10.1126/science.1258096" target="_blank">https://doi.org/10.1126/science.1258096</a>'
  );
});

test('formatRef Vancouver', () => {
  const s = PD.formatRef(DOUDNA, 'vancouver');
  assert.equal(
    s,
    'Doudna JA, Charpentier E. The new frontier of genome engineering with CRISPR-Cas9. Science. 2014;346(6213):1258096. doi:10.1126/science.1258096.'
  );
});

test('formatRef Nature', () => {
  const s = PD.formatRef(DOUDNA, 'nature');
  assert.equal(
    s,
    'Doudna, J. A. et al. The new frontier of genome engineering with CRISPR-Cas9. <em>Science</em> <b>346</b>, 1258096 (2014). <a href="https://doi.org/10.1126/science.1258096" target="_blank">https://doi.org/10.1126/science.1258096</a>'
  );
});

test('formatRef IEEE with numeric label', () => {
  const s = PD.formatRef(DOUDNA, 'ieee', 5);
  assert.equal(
    s,
    '[5] J. A. Doudna, E. Charpentier, "The new frontier of genome engineering with CRISPR-Cas9," <em>Science</em>, vol. 346, no. 6213, pp. 1258096, 2014, doi: 10.1126/science.1258096.'
  );
});

test('formatRef Chicago author-date', () => {
  const s = PD.formatRef(DOUDNA, 'chicago');
  assert.equal(
    s,
    'Doudna, Jennifer A., and Charpentier, Emmanuelle. "The new frontier of genome engineering with CRISPR-Cas9." <em>Science</em> 346, no. 6213 (2014): 1258096. https://doi.org/10.1126/science.1258096.'
  );
});

test('formatRef MLA 9', () => {
  const s = PD.formatRef(DOUDNA, 'mla');
  assert.equal(
    s,
    'Doudna, Jennifer A., et al. "The new frontier of genome engineering with CRISPR-Cas9." <em>Science</em>, vol. 346, no. 6213, 2014, pp. 1258096. https://doi.org/10.1126/science.1258096'
  );
});

test('formatRef handles a single author without an ampersand', () => {
  const one = { title: 'Attention is all you need', authors: ['Vaswani, Ashish'], year: '2017', journal: 'NeurIPS' };
  assert.ok(PD.formatRef(one, 'apa').startsWith('Vaswani, A. (2017).'));
  assert.ok(PD.formatRef(one, 'mla').startsWith('Vaswani, Ashish. "Attention is all you need."'));
});

/* ---------- citeLabel ---------- */

test('citeLabel numbered vs author-year', () => {
  assert.equal(PD.citeLabel(DOUDNA, 'numbered', 3), '[3]');
  assert.equal(PD.citeLabel(DOUDNA, 'author-year', 3), '(Doudna et al., 2014)');
  const solo = { title: 'Solo work', authors: ['One, Author'], year: '2021' };
  assert.equal(PD.citeLabel(solo, 'author-year', 1), '(One, 2021)');
});

/* ---------- WoS / open links ---------- */

test('wosURL uses the full-record deep link when a WOS UT is present', () => {
  assert.equal(
    PD.wosURL({ ut: 'WOS:000313661413004', title: 'x' }),
    'https://www.webofscience.com/wos/woscc/full-record/WOS:000313661413004'
  );
  assert.equal(
    PD.wosURL({ ut: '000313661413004', title: 'x' }),
    'https://www.webofscience.com/wos/woscc/full-record/WOS:000313661413004'
  );
});

test('wosURL falls back to a DOI/title search link without an accession number', () => {
  const byDoi = PD.wosURL({ doi: '10.1038/nature14539' });
  assert.equal(
    byDoi,
    'https://www.webofscience.com/wos/woscc/general-search?searchQuery=' + encodeURIComponent('DO=(10.1038/nature14539)')
  );
  const byTitle = PD.wosURL({ title: 'Deep learning' });
  assert.equal(
    byTitle,
    'https://www.webofscience.com/wos/woscc/general-search?searchQuery=' + encodeURIComponent('Deep learning')
  );
});

test('doiURL / openalexURL / pmidURL', () => {
  assert.equal(PD.doiURL({ doi: '10.1038/nature14539' }), 'https://doi.org/10.1038/nature14539');
  assert.equal(PD.doiURL({}), '');
  assert.equal(PD.openalexURL({ oaId: 'W2755950973' }), 'https://openalex.org/works/W2755950973');
  assert.equal(PD.pmidURL({ pmid: '26017442' }), 'https://pubmed.ncbi.nlm.nih.gov/26017442/');
});

/* ---------- OpenAlex work adapter (real API shape) ---------- */

test('normWork maps an OpenAlex work payload onto a library item', () => {
  const w = {
    id: 'https://openalex.org/W2755950973',
    doi: 'https://doi.org/10.1038/nature14539',
    display_name: 'Deep learning',
    publication_year: 2015,
    cited_by_count: 40000,
    fwci: 3.18,
    type: 'article',
    authorships: [
      { author: { display_name: 'Yann LeCun' } },
      { author: { display_name: 'Yoshua Bengio' } },
      { author: { display_name: 'Geoffrey Hinton' } },
    ],
    primary_location: { source: { display_name: 'Nature' } },
    open_access: { oa_url: 'https://example.com/deep-learning.pdf' },
    biblio: { volume: '521', issue: '7553', first_page: '436', last_page: '444' },
    ids: { pmid: '26017442', wos: '' },
    primary_topic: { display_name: 'Artificial neural network' },
    keywords: [{ display_name: 'deep learning' }, { display_name: 'neural network' }],
    abstract_inverted_index: { deep: [0], learning: [1], allows: [2], computational: [3], models: [4] },
    related_works: ['https://openalex.org/W2100837269'],
  };
  const it = PD.normWork(w);
  assert.equal(it.title, 'Deep learning');
  assert.equal(it.oaId, 'W2755950973');
  assert.equal(it.doi, '10.1038/nature14539');
  assert.deepEqual(it.authors, ['Yann LeCun', 'Yoshua Bengio', 'Geoffrey Hinton']);
  assert.equal(it.journal, 'Nature');
  assert.equal(it.volume, '521');
  assert.equal(it.issue, '7553');
  assert.equal(it.pages, '436-444');
  assert.equal(it.pmid, '26017442');
  assert.equal(it.citedBy, 40000);
  assert.equal(it.abstract, 'deep learning allows computational models');
  assert.equal(it.oaUrl, 'https://example.com/deep-learning.pdf');
  assert.deepEqual(it.related, ['W2100837269']);
  assert.ok(it.concepts.includes('Artificial neural network'));
});