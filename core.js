/* HerPaper core: 状态 / 数据源 / 解析 / 引文格式化 / 导出 / 图表 */
(function () {
'use strict';
const PD = window.PD = {};
const LS_KEY = 'herpaper.state.v1';
const MAIL = 'mailto=research@example.com';
const OA = 'https://api.openalex.org';
// 静态托管（GitHub Pages 等）没有本地后端：跳过 /api 探测与代理回落，直接连开放学术 API
PD.staticHost = /(^|\.)(github\.io|pages\.dev|netlify\.app|vercel\.app)$/i.test(location.hostname) || window.PD_FORCE_STATIC === true;

PD.state = { library: [], groups: [], settings: { style: 'gbt7714', citeMode: 'numbered', journal: '' }, manuscript: '', updatedAt: 0 };
PD.serverMode = false;
PD.searchResults = [];
PD.relatedItems = [];

/* ---------- 基础工具 ---------- */
PD.uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
PD.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
PD.normDOI = s => String(s || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/\s/g, '').toLowerCase();
PD.normTitle = s => String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '').slice(0, 200);
PD.keyOf = it => (it.doi ? 'doi:' + PD.normDOI(it.doi) : 'ti:' + PD.normTitle(it.title));
PD.num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

PD.toast = function (msg, ms) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(PD._toastT);
  PD._toastT = setTimeout(() => el.classList.remove('show'), ms || 2600);
};

PD.download = function (name, content, mime) {
  const bom = (mime === 'text/csv') ? '\ufeff' : '';
  const blob = new Blob([bom + content], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
};

PD.copy = async function (text) {
  try { await navigator.clipboard.writeText(text); PD.toast('已复制到剪贴板'); }
  catch (e) {
    const t = document.createElement('textarea'); t.value = text;
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); PD.toast('已复制到剪贴板'); }
    catch (err) { PD.toast('复制失败，请手动选择'); }
    t.remove();
  }
};

/* ---------- 状态持久化 ---------- */
let saveT = null;
PD.save = function () { clearTimeout(saveT); saveT = setTimeout(PD.saveNow, 700); };
PD.saveNow = async function () {
  PD.state.updatedAt = Date.now();
  if (PD.serverMode) {
    try { await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(PD.state) }); }
    catch (e) { PD.toast('服务端保存失败，已回退到本地'); localStorage.setItem(LS_KEY, JSON.stringify(PD.state)); }
  } else {
    try { localStorage.setItem(LS_KEY, JSON.stringify(PD.state)); }
    catch (e) { PD.toast('本地存储写入失败'); }
  }
  if (PD.onState) PD.onState();
};

PD.init = async function () {
  if (!PD.staticHost && (location.protocol === 'http:' || location.protocol === 'https:')) {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (r.ok) {
        const s = await r.json();
        if (s && Array.isArray(s.library)) {
          PD.serverMode = true;
          PD.state = Object.assign({ library: [], groups: [], settings: {}, manuscript: '', updatedAt: 0 }, s);
          PD.state.settings = Object.assign({ style: 'gbt7714', citeMode: 'numbered', journal: '' }, s.settings || {});
          return true;
        }
      }
    } catch (e) { /* 静态托管，走本地 */ }
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      PD.state = Object.assign({ library: [], groups: [], settings: {}, manuscript: '', updatedAt: 0 }, s);
      PD.state.settings = Object.assign({ style: 'gbt7714', citeMode: 'numbered', journal: '' }, s.settings || {});
    }
  } catch (e) { }
  return false;
};

PD.addItems = function (items, quiet) {
  const map = new Map(PD.state.library.map(x => [PD.keyOf(x), x]));
  let added = 0, updated = 0;
  (items || []).forEach(raw => {
    if (!raw || !raw.title) return;
    const it = Object.assign({
      id: PD.uid(), title: '', authors: [], year: '', journal: '', doi: '', pmid: '', ut: '',
      type: '', volume: '', issue: '', pages: '', abstract: '', citedBy: 0, countsByYear: [],
      fwci: null, percentile: null, concepts: [], oaUrl: '', url: '', oaId: '', related: [],
      tags: [], groups: [], starred: false, read: false, note: '', addedAt: Date.now(), source: ''
    }, raw);
    it.doi = PD.normDOI(it.doi);
    it.authors = Array.isArray(it.authors) ? it.authors.filter(Boolean) : [];
    it.tags = Array.isArray(it.tags) ? it.tags : [];
    it.groups = Array.isArray(it.groups) ? it.groups : [];
    const k = PD.keyOf(it);
    if (map.has(k)) {
      const old = map.get(k);
      ['journal', 'abstract', 'volume', 'issue', 'pages', 'pmid', 'ut', 'oaUrl', 'url', 'oaId', 'fwci', 'percentile'].forEach(f => {
        if (!old[f] && it[f]) old[f] = it[f];
      });
      if (!old.authors.length && it.authors.length) old.authors = it.authors;
      if (!old.year && it.year) old.year = it.year;
      if (it.citedBy > (old.citedBy || 0)) { old.citedBy = it.citedBy; old.countsByYear = it.countsByYear || []; }
      if (it.concepts && it.concepts.length && !(old.concepts || []).length) old.concepts = it.concepts;
      if (it.related && it.related.length) old.related = it.related;
      updated++;
    } else { map.set(k, it); added++; }
  });
  PD.state.library = Array.from(map.values());
  PD.save();
  if (!quiet) PD.toast('加入 ' + added + ' 篇' + (updated ? '，补全 ' + updated + ' 篇' : ''));
  return { added, updated };
};

/* ---------- API ---------- */
PD.fetchText = async function (url) {
  const tries = [];
  if (PD.serverMode) tries.push('/api/proxy?url=' + encodeURIComponent(url));
  tries.push(url);
  if (!PD.staticHost && location.protocol.startsWith('http') && !PD.serverMode) tries.push('/api/proxy?url=' + encodeURIComponent(url));
  let last;
  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: { Accept: 'text/xml,application/xml,text/html;q=0.9,*/*;q=0.8' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) { last = e; }
  }
  throw last || new Error('网络请求失败');
};
PD.fetchJSON = async function (url) {
  const tries = [];
  if (PD.serverMode) tries.push('/api/proxy?url=' + encodeURIComponent(url));
  tries.push(url);
  if (!PD.staticHost && location.protocol.startsWith('http') && !PD.serverMode) tries.push('/api/proxy?url=' + encodeURIComponent(url));
  let last;
  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (d && d.error) throw new Error(String(d.error));
      return d;
    } catch (e) { last = e; }
  }
  throw last || new Error('网络请求失败');
};

function invertAbstract(inv) {
  if (!inv || typeof inv !== 'object') return '';
  const arr = [];
  Object.keys(inv).forEach(w => (inv[w] || []).forEach(i => { arr[i] = w; }));
  return arr.filter(Boolean).join(' ').slice(0, 3000);
}

PD.normWork = function (w) {
  const doi = PD.normDOI(w.doi);
  const src = (w.primary_location && w.primary_location.source) || {};
  const ids = w.ids || {};
  const b = w.biblio || {};
  const concepts = (w.keywords || []).map(k => k.display_name).filter(Boolean).slice(0, 6);
  if (!concepts.length) (w.concepts || []).slice(0, 5).forEach(c => concepts.push(c.display_name));
  if (w.primary_topic && w.primary_topic.display_name) concepts.unshift(w.primary_topic.display_name);
  return {
    id: PD.uid(), title: w.display_name || w.title || '',
    authors: (w.authorships || []).map(a => (a.author || {}).display_name).filter(Boolean).slice(0, 40),
    year: w.publication_year || (w.publication_date || '').slice(0, 4) || '',
    journal: src.display_name || (Array.isArray(w.locations) && w.locations[0] && w.locations[0].source && w.locations[0].source.display_name) || '',
    doi, pmid: String(ids.pmid || '').split('/').pop() || '',
    ut: String(ids.wos || '') || '', type: w.type || '',
    volume: b.volume || '', issue: b.issue || '',
    pages: b.first_page ? (b.first_page + (b.last_page ? '-' + b.last_page : '')) : '',
    abstract: invertAbstract(w.abstract_inverted_index),
    citedBy: PD.num(w.cited_by_count), countsByYear: w.counts_by_year || [],
    fwci: w.fwci == null ? null : w.fwci,
    percentile: w.citation_normalized_percentile ? w.citation_normalized_percentile.value : null,
    concepts: concepts.filter(Boolean).slice(0, 8),
    oaUrl: (w.open_access || {}).oa_url || '',
    url: doi ? 'https://doi.org/' + doi : ((w.primary_location || {}).landing_page_url || ''),
    oaId: String(w.id || '').split('/').pop() || '',
    related: (w.related_works || []).map(x => String(x).split('/').pop()),
    addedAt: Date.now(), source: 'OpenAlex',
    tags: [], groups: [], starred: false, read: false, note: ''
  };
};

// arXiv Atom entry → library item (q-fin preprints; citedBy fills later via DOI refresh).
PD.normArxiv = function (e) {
  const txt = s => (s && s.textContent || '').trim();
  const g = tag => e.querySelector(tag);
  const absUrl = txt(g('id'));
  const axId = (absUrl.match(/abs\/([^v]+v\d+|[^/]+)$/) || [])[1] || absUrl;
  const doiEl = e.querySelector('doi'); // arXiv may carry a journal-ref DOI on some entries
  const doi = doiEl ? PD.normDOI(txt(doiEl)) : '';
  const authors = Array.from(e.querySelectorAll('author > name')).map(n => n.textContent.trim()).filter(Boolean);
  const published = txt(g('published'));
  return {
    id: 'arxiv:' + axId,
    title: txt(g('title')).replace(/\s+/g, ' ').replace(/\.$/, ''),
    authors,
    year: published.slice(0, 4) || '',
    journal: 'arXiv (q-fin)',
    doi,
    type: 'preprint',
    abstract: txt(g('summary')).replace(/\s+/g, ' ').slice(0, 1200),
    citedBy: 0, countsByYear: [], fwci: null, percentile: null, concepts: [],
    oaUrl: absUrl,
    url: absUrl,
    oaId: '', related: [], addedAt: Date.now(), source: 'arXiv',
    tags: [], groups: [], starred: false, read: false, note: ''
  };
};

// Semantic Scholar Graph API paper → library item.
PD.normS2 = function (p) {
  const doi = p.externalIds && p.externalIds.DOI ? PD.normDOI(p.externalIds.DOI) : '';
  const pdf = p.openAccessPdf && p.openAccessPdf.url ? p.openAccessPdf.url : '';
  return {
    id: doi ? 'doi:' + doi : 's2:' + (p.paperId || PD.uid()),
    title: (p.title || '').replace(/\.$/, ''),
    authors: (p.authors || []).map(a => a.name).filter(Boolean),
    year: p.year ? String(p.year) : '',
    journal: p.venue || '',
    doi,
    type: '',
    abstract: (p.abstract || '').slice(0, 1200),
    citedBy: PD.num(p.citationCount), countsByYear: [], fwci: null, percentile: null, concepts: [],
    oaUrl: pdf,
    url: doi ? 'https://doi.org/' + doi : (p.paperId ? 'https://www.semanticscholar.org/paper/' + p.paperId : ''),
    oaId: '', related: [], addedAt: Date.now(), source: 'Semantic Scholar',
    tags: [], groups: [], starred: false, read: false, note: ''
  };
};

PD.normEPMC = function (r) {
  const ji = r.journalInfo || {};
  const j = ji.journal || {};
  return {
    id: PD.uid(), title: (r.title || '').replace(/\.$/, ''),
    authors: (r.authorString || '').replace(/\.$/, '').split(/,\s*/).filter(Boolean),
    year: r.pubYear || (r.firstPublicationDate || '').slice(0, 4) || '',
    journal: r.journalTitle || j.title || '', doi: PD.normDOI(r.doi), pmid: r.pmid || '',
    ut: '', type: (r.pubTypeList && r.pubTypeList.pubType || [])[0] || '',
    volume: ji.volume || '', issue: ji.issue || '', pages: r.pageInfo || '',
    abstract: (r.abstractText || '').replace(/<[^>]+>/g, ' '),
    citedBy: PD.num(r.citedByCount), countsByYear: [],
    fwci: null, percentile: null,
    concepts: (((r.meshHeadingList || {}).meshHeading) || []).map(x => x.descriptorName).filter(Boolean).slice(0, 6),
    oaUrl: r.isOpenAccess === 'Y' && r.pmcid ? 'https://europepmc.org/articles/' + r.pmcid : '',
    url: r.doi ? 'https://doi.org/' + PD.normDOI(r.doi) : 'https://europepmc.org/article/MED/' + r.pmid,
    oaId: '', related: [], addedAt: Date.now(), source: 'Europe PMC',
    tags: [], groups: [], starred: false, read: false, note: ''
  };
};

PD.search = async function (o) {
  const page = o.page || 1, per = 20;
  if (o.source === 'arxiv') {
    // arXiv q-fin (Quantitative Finance). export.arxiv.org sends no CORS
    // headers, so the SuPro side relays it via /api/herpaper/arxiv (allow-list).
    const q = '(cat:q-fin.*) AND all:' + encodeURIComponent(o.q || '');
    const direct = 'https://export.arxiv.org/api/query?search_query=' + encodeURIComponent(q) +
      '&start=' + (page - 1) * per + '&max_results=' + per + '&sortBy=submittedDate&sortOrder=descending';
    let xml = '';
    try { xml = await PD.fetchText('/api/herpaper/arxiv?query=' + encodeURIComponent(o.q || '') + '&start=' + (page - 1) * per + '&max_results=' + per); }
    catch (e) { xml = await PD.fetchText(direct); }
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('arXiv 响应解析失败');
    let items = Array.from(doc.querySelectorAll('entry')).map(PD.normArxiv);
    if (o.from) items = items.filter(x => PD.num(x.year) >= PD.num(o.from));
    if (o.to) items = items.filter(x => PD.num(x.year) <= PD.num(o.to));
    const tr = doc.querySelector('totalResults');
    return { items, total: PD.num(tr && tr.textContent) || items.length, page };
  }
  if (o.source === 's2') {
    // Semantic Scholar Graph API — CORS-enabled, free tier.
    let u = 'https://api.semanticscholar.org/graph/v1/paper/search?query=' + encodeURIComponent(o.q || '') +
      '&fields=title,abstract,year,authors,venue,externalIds,citationCount,openAccessPdf&limit=' + per + '&offset=' + (page - 1) * per;
    if (o.from && o.to) u += '&year=' + o.from + '-' + o.to;
    else if (o.from) u += '&year=' + o.from + '-';
    else if (o.to) u += '&year=-' + o.to;
    const d = await PD.fetchJSON(u);
    return { items: (d.data || []).map(PD.normS2), total: PD.num(d.total), page };
  }
  if (o.source === 'epmc') {
    let query = o.q;
    const u = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=' + encodeURIComponent(query) +
      '&format=json&resultType=core&pageSize=' + per + '&page=' + page;
    const d = await PD.fetchJSON(u);
    let items = ((d.resultList || {}).result || []).map(PD.normEPMC);
    if (o.from) items = items.filter(x => PD.num(x.year) >= PD.num(o.from));
    if (o.to) items = items.filter(x => PD.num(x.year) <= PD.num(o.to));
    if (o.oa) items = items.filter(x => x.oaUrl);
    return { items, total: PD.num((d.hitCount)), page };
  }
  if (o.source === 'doi') {
    const doi = PD.normDOI(o.q);
    if (!doi) return { items: [], total: 0, page: 1 };
    const d = await PD.fetchJSON(OA + '/works?filter=doi:' + encodeURIComponent(doi) + '&per-page=5&' + MAIL);
    return { items: (d.results || []).map(PD.normWork), total: (d.meta || {}).count || 0, page: 1 };
  }
  const f = [];
  if (o.from) f.push('from_publication_date:' + o.from + '-01-01');
  if (o.to) f.push('to_publication_date:' + o.to + '-12-31');
  if (o.type) f.push('type:' + o.type);
  if (o.oa) f.push('is_oa:true');
  let u = OA + '/works?search=' + encodeURIComponent(o.q) + '&page=' + page + '&per-page=' + per + '&' + MAIL;
  if (f.length) u += '&filter=' + encodeURIComponent(f.join(','));
  const d = await PD.fetchJSON(u);
  return { items: (d.results || []).map(PD.normWork), total: (d.meta || {}).count || 0, page };
};

PD.lookupDOIs = async function (dois, onProgress) {
  const clean = Array.from(new Set((dois || []).map(PD.normDOI).filter(Boolean)));
  let out = [];
  for (let i = 0; i < clean.length; i += 40) {
    const chunk = clean.slice(i, i + 40);
    try {
      const d = await PD.fetchJSON(OA + '/works?filter=doi:' + encodeURIComponent(chunk.join('|')) + '&per-page=50&' + MAIL);
      out = out.concat((d.results || []).map(PD.normWork));
    } catch (e) { /* 单批失败跳过 */ }
    if (onProgress) onProgress(Math.min(i + 40, clean.length), clean.length);
  }
  return out;
};

PD.refresh = async function (items, onProgress) {
  const withDoi = items.filter(x => x.doi);
  const map = new Map();
  for (let i = 0; i < withDoi.length; i += 40) {
    const chunk = withDoi.slice(i, i + 40);
    try {
      const d = await PD.fetchJSON(OA + '/works?filter=doi:' + encodeURIComponent(chunk.map(x => x.doi).join('|')) + '&per-page=50&' + MAIL);
      (d.results || []).forEach(w => map.set(PD.normDOI(w.doi), PD.normWork(w)));
    } catch (e) { }
    if (onProgress) onProgress(Math.min(i + 40, withDoi.length), withDoi.length);
  }
  // 无 DOI 的条目按题名逐条补（最多 20 条，避免拖慢）
  let titleDone = 0;
  for (const it of items.filter(x => !x.doi && x.title).slice(0, 20)) {
    try {
      const d = await PD.fetchJSON(OA + '/works?search=' + encodeURIComponent(it.title) + '&per-page=1&' + MAIL);
      const w = (d.results || [])[0];
      if (w && PD.normTitle(w.display_name) === PD.normTitle(it.title)) map.set('__t_' + it.id, PD.normWork(w));
    } catch (e) { }
    titleDone++;
    if (onProgress) onProgress(withDoi.length + titleDone, withDoi.length + Math.min(20, items.filter(x => !x.doi).length));
  }
  items.forEach(it => {
    const w = map.get(it.doi) || map.get('__t_' + it.id);
    if (!w) return;
    it.citedBy = w.citedBy; it.countsByYear = w.countsByYear;
    it.fwci = w.fwci; it.percentile = w.percentile;
    it.concepts = w.concepts.length ? w.concepts : it.concepts;
    it.related = w.related.length ? w.related : it.related;
    if (w.oaId) it.oaId = w.oaId;
    if (w.abstract && !it.abstract) it.abstract = w.abstract;
    if (w.journal && !it.journal) it.journal = w.journal;
    if (w.authors.length && !it.authors.length) it.authors = w.authors;
    if (w.year && !it.year) it.year = w.year;
    if (w.pmid && !it.pmid) it.pmid = w.pmid;
    if (w.oaUrl) it.oaUrl = w.oaUrl;
    if (w.doi && !it.doi) it.doi = w.doi;
  });
  return items;
};

PD.related = async function (ids) {
  const clean = (ids || []).filter(Boolean).slice(0, 10);
  if (!clean.length) return [];
  try {
    const d = await PD.fetchJSON(OA + '/works?filter=openalex_id:' + encodeURIComponent(clean.join('|')) + '&per-page=20&' + MAIL);
    return (d.results || []).map(PD.normWork);
  } catch (e) { return []; }
};

PD.sources = async function (queries) {
  const all = new Map();
  for (const q of queries.slice(0, 4)) {
    try {
      const d = await PD.fetchJSON(OA + '/sources?search=' + encodeURIComponent(q) +
        '&per-page=12&select=id,display_name,issn_l,summary_stats,works_count,topics,homepage_url,host_organization_name,type,is_oa,apc_usd&' + MAIL);
      (d.results || []).forEach(s => all.set(s.id, s));
    } catch (e) { }
  }
  return Array.from(all.values());
};

/* ---------- 文件解析 ---------- */
const TAGS = new Set(('TY AU A1 A2 A3 A4 TI T1 T2 T3 BT CT JO JF JA J1 J2 SO PY Y1 DA VL VO IS SP EP BP CP DO DI UR L1 L2 AB N2 KW DE ID SN PB CY LA M1 M3 ER PT UT AN PM PMID TC Z9 PG WC SC NR FN VR C1 EM FU FX').split(' '));

function tagLines(text) {
  const out = [];
  text.split(/\r?\n/).forEach(line => {
    let m = line.match(/^([A-Z][A-Z0-9])\s+-\s+(.*)$/);          // RIS: "TI  - xxx"
    if (!m) m = line.match(/^([A-Z][A-Z0-9])(?:\s{1,3}(.*))?$/); // WoS: "TI xxx" / 单独一行 "ER"
    if (m && TAGS.has(m[1])) out.push([m[1], (m[2] || '').trim()]);
    else if (out.length) out[out.length - 1][1] += ' ' + line.trim(); // 续行
  });
  return out;
}

function first(rec, keys) { for (const k of keys) if (rec[k] && rec[k].length) return rec[k][0]; return ''; }
function all(rec, keys) { let a = []; keys.forEach(k => { a = a.concat(rec[k] || []); }); return a; }

function recToItem(rec) {
  const yr = (first(rec, ['PY', 'Y1', 'DA']) || '').match(/(19|20)\d{2}/);
  const sp = first(rec, ['SP', 'BP']), ep = first(rec, ['EP']);
  const ut = first(rec, ['UT', 'AN']) || '';
  const doi = PD.normDOI(first(rec, ['DO', 'DI', 'M1']));
  const title = first(rec, ['TI', 'T1', 'BT', 'CT']);
  if (!title) return null;
  return {
    id: PD.uid(), title,
    authors: all(rec, ['AU', 'A1', 'A2', 'A3', 'A4']).map(a => a.replace(/,+$/, '')),
    year: yr ? yr[0] : '',
    journal: first(rec, ['JO', 'JF', 'JA', 'J1', 'J2', 'T2', 'SO']),
    doi, pmid: first(rec, ['PM', 'PMID']), ut: /WOS[:：]?/i.test(ut) || /^\d{15}/.test(ut) ? ut : '',
    type: first(rec, ['TY', 'PT', 'M3']),
    volume: first(rec, ['VL', 'VO']), issue: first(rec, ['IS']),
    pages: sp ? (sp + (ep ? '-' + ep : '')) : first(rec, ['CP']),
    abstract: first(rec, ['AB', 'N2']),
    citedBy: PD.num((first(rec, ['TC', 'Z9']) || '').match(/^\d+$/) ? first(rec, ['TC', 'Z9']) : 0),
    keywords: all(rec, ['KW', 'DE']), utRaw: ut,
    tags: [], groups: [], starred: false, read: false, note: '',
    addedAt: Date.now(), source: 'import', concepts: [], countsByYear: [], related: [],
    url: doi ? 'https://doi.org/' + doi : first(rec, ['UR', 'L1'])
  };
}

PD.parseTagged = function (text) {
  const lines = tagLines(text), items = []; let rec = {};
  const push = () => { const it = recToItem(rec); if (it) items.push(it); rec = {}; };
  lines.forEach(([tag, val]) => {
    if (tag === 'ER') { push(); return; }
    if ((tag === 'TY' || tag === 'PT' || tag === 'FN') && Object.keys(rec).length) push();
    if (tag === 'FN' || tag === 'VR') return;
    (rec[tag] = rec[tag] || []).push(val);
  });
  if (Object.keys(rec).length) push();
  return items;
};

PD.parseBibtex = function (text) {
  const items = [];
  let pos = 0;
  while (true) {
    const start = text.indexOf('@', pos);
    if (start < 0) break;
    const open = text.indexOf('{', start);
    if (open < 0 || open - start > 40) { pos = start + 1; continue; }
    const etype = text.slice(start + 1, open).trim().toLowerCase();
    let depth = 0, end = -1, quoted = false;
    for (let i = open; i < text.length; i++) {
      const c = text[i];
      if (c === '"' && text[i - 1] !== '\\') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) break;
    pos = end + 1;
    const body = text.slice(open + 1, end);
    const comma = body.indexOf(',');
    const fieldsText = comma >= 0 ? body.slice(comma + 1) : body;
    const f = {}, fre = /([\w-]+)\s*=\s*/g;
    let fm;
    while ((fm = fre.exec(fieldsText))) {
      let i = fre.lastIndex, val = '';
      while (i < fieldsText.length && /\s/.test(fieldsText[i])) i++;
      if (fieldsText[i] === '{') {
        let d = 0, j = i;
        for (; j < fieldsText.length; j++) {
          if (fieldsText[j] === '{') d++;
          else if (fieldsText[j] === '}') { d--; if (!d) break; }
        }
        val = fieldsText.slice(i + 1, j); i = j + 1;
      } else if (fieldsText[i] === '"') {
        let j = i + 1;
        while (j < fieldsText.length && fieldsText[j] !== '"') j++;
        val = fieldsText.slice(i + 1, j); i = j + 1;
      } else {
        let j = i;
        while (j < fieldsText.length && fieldsText[j] !== ',') j++;
        val = fieldsText.slice(i, j); i = j;
      }
      const k = fm[1].toLowerCase();
      (f[k] = f[k] || []).push(val.replace(/\s+/g, ' ').trim());
      fre.lastIndex = i;
    }
    const doi = PD.normDOI(first(f, ['doi']));
    const title = first(f, ['title']);
    if (!title) continue;
    const yr = (first(f, ['year', 'date']) || '').match(/(19|20)\d{2}/);
    items.push({
      id: PD.uid(), title, authors: (first(f, ['author', 'editor']) || '').split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean),
      year: yr ? yr[0] : '', journal: first(f, ['journal', 'journaltitle', 'booktitle', 'publisher']),
      doi, pmid: first(f, ['pmid']), ut: '', type: etype, volume: first(f, ['volume']), issue: first(f, ['number', 'issue']),
      pages: first(f, ['pages']), abstract: first(f, ['abstract']), citedBy: 0,
      keywords: (first(f, ['keywords']) || '').split(/[;,]/).filter(Boolean),
      tags: [], groups: [], starred: false, read: false, note: '', addedAt: Date.now(), source: 'BibTeX',
      concepts: [], countsByYear: [], related: [], url: doi ? 'https://doi.org/' + doi : first(f, ['url'])
    });
  }
  return items;
};

function csvRows(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x && x.trim()));
}

PD.parseCSV = function (text) {
  const rows = csvRows(text.replace(/^\ufeff/, ''));
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = keys => { for (const k of keys) { const i = head.findIndex(h => h === k || h.includes(k)); if (i >= 0) return i; } return -1; };
  const idx = {
    title: col(['article title', 'title', '题名']), author: col(['authors', 'author', '作者']),
    year: col(['publication year', 'year', '年份']), journal: col(['source title', 'journal', '期刊']),
    doi: col(['doi']), abstract: col(['abstract', '摘要']), cited: col(['times cited', 'cited', '被引']),
    ut: col(['ut (unique', 'accession number', 'ut']), volume: col(['volume']), issue: col(['issue']), pages: col(['pages']), kw: col(['author keywords', 'keywords'])
  };
  if (idx.title < 0) return [];
  const get = (r, i) => i >= 0 && r[i] != null ? r[i].trim() : '';
  return rows.slice(1).map(r => {
    const title = get(r, idx.title); if (!title) return null;
    const doi = PD.normDOI(get(r, idx.doi));
    return {
      id: PD.uid(), title, authors: get(r, idx.author).split(/[;,]/).map(s => s.trim()).filter(Boolean),
      year: (get(r, idx.year).match(/(19|20)\d{2}/) || [''])[0], journal: get(r, idx.journal),
      doi, pmid: '', ut: get(r, idx.ut), type: '', volume: get(r, idx.volume), issue: get(r, idx.issue),
      pages: get(r, idx.pages), abstract: get(r, idx.abstract), citedBy: PD.num(get(r, idx.cited)),
      keywords: get(r, idx.kw).split(';').filter(Boolean), tags: [], groups: [], starred: false, read: false, note: '',
      addedAt: Date.now(), source: 'CSV', concepts: [], countsByYear: [], related: [],
      url: doi ? 'https://doi.org/' + doi : ''
    };
  }).filter(Boolean);
};

PD.parseAny = function (text, name) {
  text = String(text || '').replace(/^\ufeff/, '');
  const n = (name || '').toLowerCase();
  if (n.endsWith('.json')) {
    try {
      const d = JSON.parse(text);
      if (Array.isArray(d)) return { items: d, state: null };
      if (d && Array.isArray(d.library)) return { items: d.library, state: d };
      return { items: [], state: null };
    } catch (e) { return { items: [], error: 'JSON 解析失败' }; }
  }
  if (/\.bib(tex)?$/.test(n) || /@\w+\s*\{/.test(text.slice(0, 400))) return { items: PD.parseBibtex(text) };
  if (n.endsWith('.csv')) return { items: PD.parseCSV(text) };
  const tagged = PD.parseTagged(text);
  if (tagged.length) return { items: tagged };
  const csv = PD.parseCSV(text);
  if (csv.length) return { items: csv };
  // 纯 DOI / 题名列表
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const dois = lines.filter(s => /^10\.\d{4,9}\//.test(s) || /^https?:\/\/(dx\.)?doi\.org\//.test(s));
  if (dois.length) return { items: [], dois };
  return { items: [], error: '未识别的文件格式' };
};

/* ---------- WoS / 开放链接 ---------- */
PD.wosURL = function (it) {
  let id = (it.ut || '').trim();
  if (/^\d{15}/.test(id)) id = 'WOS:' + id;
  if (/^WOS:/i.test(id)) {
    return 'https://www.webofscience.com/wos/woscc/full-record/' + id.replace(/[^A-Za-z0-9:_-]/g, '');
  }
  const q = it.doi ? 'DO=(' + it.doi + ')' : (it.title || '');
  return 'https://www.webofscience.com/wos/woscc/general-search?searchQuery=' + encodeURIComponent(q);
};
PD.openalexURL = it => it.oaId ? 'https://openalex.org/works/' + it.oaId : '';
PD.doiURL = it => it.doi ? 'https://doi.org/' + it.doi : '';
PD.pmidURL = it => it.pmid ? 'https://pubmed.ncbi.nlm.nih.gov/' + it.pmid + '/' : '';

/* ---------- 引文格式化 ---------- */
function authorParts(name) {
  const s = String(name || '').trim().replace(/\s+/g, ' ');
  if (!s) return { last: 'Anon', ini: '', full: 'Anon', first: '' };
  // WoS / EndNote / RIS 常见写法：Hammond, A 或 Smith, John R.
  if (s.includes(',')) {
    const seg = s.split(',').map(x => x.trim()).filter(Boolean);
    const last = seg[0] || s, given = seg.slice(1).join(' ') || '';
    const ini = given.split(/[\s.]+/).filter(Boolean).map(x => x[0].toUpperCase()).join('');
    return { last, ini, full: (given ? given + ' ' : '') + last, first: given.split(/\s+/)[0] || '' };
  }
  if (/[\u4e00-\u9fa5]/.test(s) && !s.includes(' ')) return { last: s, ini: '', full: s, first: '' };
  const p = s.split(' '), last = p.pop(), first = p[0] || '';
  const ini = p.map(x => x[0] ? x[0].toUpperCase() : '').join('');
  return { last, ini, full: s, first };
}
function etAl(it) { return /[\u4e00-\u9fa5]/.test(it.title || '') ? '等' : 'et al.'; }
function pagesShort(p) { return String(p || '').replace(/(\d+)-(\d+)/g, (m, a, b) => a + '-' + (b.length > a.length ? b.slice(0, a.length) : b)); }

PD.formatRef = function (it, style, n) {
  const A = (it.authors || []).map(authorParts);
  const t = it.title || '', j = it.journal || '', y = it.year || 'n.d.', v = it.volume || '', is = it.issue || '', p = it.pages || '';
  const doi = it.doi ? 'https://doi.org/' + it.doi : '';
  const first = A[0] || { last: 'Anon', ini: '', full: 'Anon' };
  const gbtA = A.slice(0, 3).map(a => (a.last.toUpperCase() + (a.ini ? ' ' + a.ini.split('').join(' ') : ''))).join(', ') + (A.length > 3 ? ', ' + etAl(it) : '');
  const vanA = A.slice(0, 6).map(a => a.last + (a.ini ? ' ' + a.ini : '')).join(', ') + (A.length > 6 ? ', et al.' : '');
  const apaA = A.length > 1
    ? A.slice(0, -1).map(a => a.last + ', ' + a.ini.split('').join('. ') + '.').join(', ') + ', & ' + A[A.length - 1].last + ', ' + A[A.length - 1].ini.split('').join('. ') + '.'
    : first.last + ', ' + first.ini.split('').join('. ') + '.';
  const ieeeA = A.slice(0, 6).map(a => (a.ini ? a.ini.split('').join('. ') + '. ' : '') + a.last).join(', ') + (A.length > 6 ? ' et al.' : '');
  switch (style) {
    case 'apa':
      return apaA + ' (' + y + '). ' + t + '. ' + (j ? '<em>' + j + '</em>' : '') + (v ? ', <em>' + v + '</em>' : '') + (is ? '(' + is + ')' : '') + (p ? ', ' + p : '') + '. ' + (doi ? '<a href="' + doi + '" target="_blank">' + doi + '</a>' : '');
    case 'vancouver':
      return vanA + '. ' + t + '. ' + j + '. ' + y + (v ? ';' + v : '') + (is ? '(' + is + ')' : '') + (p ? ':' + pagesShort(p) : '') + '.' + (it.doi ? ' doi:' + it.doi + '.' : '');
    case 'nature':
      return first.last + ', ' + (first.ini ? first.ini.split('').join('. ') + '.' : '') + (A.length > 1 ? ' et al.' : '') + ' ' + t + '. <em>' + j + '</em> <b>' + v + '</b>, ' + p + ' (' + y + ').' + (doi ? ' <a href="' + doi + '" target="_blank">' + doi + '</a>' : '');
    case 'ieee':
      return (n ? '[' + n + '] ' : '') + ieeeA + ', "' + t + '," ' + (j ? '<em>' + j + '</em>, ' : '') + (v ? 'vol. ' + v + ', ' : '') + (is ? 'no. ' + is + ', ' : '') + (p ? 'pp. ' + p + ', ' : '') + y + (it.doi ? ', doi: ' + it.doi : '') + '.';
    case 'chicago':
      return (A.length ? A.map(a => a.last + ', ' + a.full.split(' ').slice(0, -1).join(' ')).slice(0, 2).join(', and ') + (A.length > 2 ? ', et al.' : '') + '. ' : '') + '"' + t + '." <em>' + j + '</em> ' + v + (is ? ', no. ' + is : '') + ' (' + y + ')' + (p ? ': ' + p : '') + '.' + (doi ? ' ' + doi + '.' : '');
    case 'mla':
      return first.last + ', ' + first.full.split(' ').slice(0, -1).join(' ') + (A.length > 1 ? ', et al.' : '.') + ' "' + t + '." <em>' + j + '</em>, ' + (v ? 'vol. ' + v + ', ' : '') + (is ? 'no. ' + is + ', ' : '') + y + (p ? ', pp. ' + p : '') + '. ' + (doi ? doi : '');
    case 'gbt7714':
    default:
      return gbtA + '. ' + t + '[J]. ' + (j || '[出版者不详]') + ', ' + y + (v ? ', ' + v : '') + (is ? '(' + is + ')' : '') + (p ? ': ' + pagesShort(p) : '') + '.' + (it.doi ? ' DOI:' + it.doi + '.' : '');
  }
};

PD.citeLabel = function (it, mode, n) {
  if (mode === 'author-year') {
    const a = authorParts((it.authors || [])[0]);
    return '(' + (a.last || 'Anon') + (it.authors && it.authors.length > 1 ? ' ' + etAl(it) : '') + ', ' + (it.year || 'n.d.') + ')';
  }
  return '[' + n + ']';
};

/* ---------- 导出 ---------- */
PD.exportRIS = function (items) {
  return items.map(it => [
    'TY  - JOUR',
    ...(it.authors || []).map(a => 'AU  - ' + a),
    'TI  - ' + (it.title || ''),
    it.journal ? 'JO  - ' + it.journal : '', 'PY  - ' + (it.year || ''),
    it.volume ? 'VL  - ' + it.volume : '', it.issue ? 'IS  - ' + it.issue : '',
    it.pages ? 'SP  - ' + it.pages : '', it.doi ? 'DO  - ' + it.doi : '',
    it.abstract ? 'AB  - ' + it.abstract : '',
    ...(it.tags || []).map(t => 'KW  - ' + t),
    it.ut ? 'UT  - ' + it.ut : '',
    it.url ? 'UR  - ' + it.url : '', 'ER  - '
  ].filter(Boolean).join('\n')).join('\n\n') + '\n';
};

PD.exportBib = function (items) {
  return items.map((it, i) => {
    const key = ((it.authors || [])[0] || 'anon').split(' ').pop().replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '') + (it.year || '') + (i + 1);
    const f = [
      ['title', it.title], ['author', (it.authors || []).join(' and ')], ['journal', it.journal],
      ['year', it.year], ['volume', it.volume], ['number', it.issue], ['pages', it.pages],
      ['doi', it.doi], ['pmid', it.pmid], ['abstract', it.abstract], ['keywords', (it.tags || []).join('; ')], ['url', it.url]
    ].filter(x => x[1]);
    return '@article{' + key + ',\n' + f.map(x => '  ' + x[0] + ' = {' + String(x[1]).replace(/[{}]/g, '') + '}').join(',\n') + '\n}';
  }).join('\n\n') + '\n';
};

PD.exportCSV = function (items) {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['Title', 'Authors', 'Year', 'Journal', 'DOI', 'Volume', 'Issue', 'Pages', 'CitedBy', 'WoS_UT', 'PMID', 'Tags', 'Groups', 'URL'];
  return [head.join(',')].concat(items.map(it => [
    it.title, (it.authors || []).join('; '), it.year, it.journal, it.doi, it.volume, it.issue, it.pages,
    it.citedBy, it.ut, it.pmid, (it.tags || []).join('; '), (it.groups || []).join('; '), it.url
  ].map(q).join(','))).join('\n');
};

PD.exportHTML = function (items, title, note) {
  const rows = items.map((it, i) => '<tr><td>' + (i + 1) + '</td><td><b>' + PD.esc(it.title) + '</b><br><span>' + PD.esc((it.authors || []).join(', ')) + '</span></td><td>' + PD.esc(it.journal) + '</td><td>' + PD.esc(it.year) + '</td><td>' + PD.esc(it.citedBy || 0) + '</td><td>' + (it.doi ? '<a href="https://doi.org/' + PD.esc(it.doi) + '">' + PD.esc(it.doi) + '</a>' : '') + '</td></tr>').join('');
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + PD.esc(title) + '</title><style>body{font-family:-apple-system,"PingFang SC",sans-serif;max-width:1000px;margin:40px auto;padding:0 20px;color:#172033}h1{font-size:24px}p.note{color:#52607a;background:#f5f7fb;padding:12px 16px;border-radius:10px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f5f7fb;text-align:left;padding:9px}td{border-top:1px solid #e6eaf2;padding:9px;vertical-align:top}td span{color:#8a97ad;font-size:11px}a{color:#4f46e5}footer{margin-top:28px;color:#8a97ad;font-size:11px}</style></head><body><h1>' + PD.esc(title) + '</h1>' + (note ? '<p class="note">' + PD.esc(note) + '</p>' : '') + '<p>共 ' + items.length + ' 篇文献 · 由 HerPaper 生成</p><table><thead><tr><th>#</th><th>题名 / 作者</th><th>期刊</th><th>年份</th><th>被引</th><th>DOI</th></tr></thead><tbody>' + rows + '</tbody></table><footer>只读快照 · 生成时间 ' + new Date().toLocaleString('zh-CN') + '</footer></body></html>';
};

/* ---------- 图表 ---------- */
PD.vbars = function (data, unit) {
  if (!data.length) return '<div class="empty">暂无数据</div>';
  const max = Math.max(...data.map(d => d.value), 1);
  return '<div class="chart">' + data.map(d =>
    '<div class="bar-wrap" title="' + PD.esc(d.label) + ': ' + d.value + '"><div class="bar-v">' + d.value + '</div><div class="bar" style="height:' + Math.max(3, d.value / max * 148) + 'px"></div><div class="bar-lb">' + PD.esc(d.label) + '</div></div>'
  ).join('') + '</div>' + (unit ? '<div class="muted" style="text-align:right">' + PD.esc(unit) + '</div>' : '');
};
PD.hbars = function (data) {
  if (!data.length) return '<div class="empty">暂无数据</div>';
  const max = Math.max(...data.map(d => d.value), 1);
  return data.map(d => '<div class="hbar"><div class="lb" title="' + PD.esc(d.label) + '">' + PD.esc(d.label) + '</div><div class="track"><div class="fill" style="width:' + (d.value / max * 100) + '%"></div></div><div class="n">' + d.value + '</div></div>').join('');
};
PD.topN = function (arr, keyFn, n) {
  const m = new Map();
  arr.forEach(x => (keyFn(x) || []).forEach(k => { if (k) m.set(k, (m.get(k) || 0) + 1); }));
  return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, n || 10);
};

/* ---------- 关键词 & 期刊匹配 ---------- */
const STOP = new Set('the a an and or of to in on for with by from at as is are was were be been being that this these those we our their its it using use used based approach study studies results result method methods analysis novel new can may also more most than via between within into show shows shown demonstrate demonstrates demonstrated effect effects role roles data model models high low significant paper article journal review research towards through two three one both such however moreover further here have has had not but which who what when where how all any each other because due while over under per non pre post doi http https www org com available 2020 2021 2022 2023 2024 2025 2026 研究 方法 结果 分析 本文 我们 通过 进行 基于 以及 一个 可以 具有 表明 显示 影响 相关 不同 主要 目前 提出 发现 使用 文献 中 的 了 和 与 在 对 为 是'.split(/\s+/));
PD.keywords = function (text, n) {
  const s = String(text || '').toLowerCase();
  const words = (s.match(/[a-z][a-z-]{3,}/g) || []).filter(w => !STOP.has(w));
  const zh = (String(text || '').match(/[\u4e00-\u9fa5]{2,12}/g) || []).filter(w => !STOP.has(w) && w.length >= 2);
  const m = new Map();
  words.concat(zh).forEach(w => m.set(w, (m.get(w) || 0) + 1));
  return Array.from(m, ([w, c]) => ({ w, c })).sort((a, b) => b.c - a.c || b.w.length - a.w.length).slice(0, n || 14).map(x => x.w);
};

PD.JOURNALS = [
  { name: 'Nature', field: '综合 · 自然科学', style: 'nature', words: '约 3000 词（正文）', abs: '无小标题单段摘要，约 150 词', sections: ['Title', 'Abstract', 'Main text（无强制小标题）', 'Methods', 'Data availability', 'Code availability', 'References', 'Acknowledgements', 'Author contributions', 'Competing interests'], note: '强调跨领域重大进展；Methods 置于正文后；参考文献上标数字。', url: 'https://www.nature.com/nature/for-authors' },
  { name: 'Science', field: '综合 · 自然科学', style: 'vancouver', words: '约 4500 词', abs: '约 125 词，无引用', sections: ['Title', 'Abstract', 'Introduction', 'Results', 'Discussion', 'Materials and Methods', 'References', 'Supplementary Materials'], note: 'Research Article 结构；建议附 Cover Letter 与 3-5 位推荐审稿人。', url: 'https://www.science.org/content/page/instructions-preparing-initial-manuscript' },
  { name: 'Cell', field: '生命科学', style: 'vancouver', words: '约 3500-5000 词', abs: '约 150 词单段', sections: ['Title', 'Summary', 'Introduction', 'Results', 'Discussion', 'STAR Methods', 'Resource availability', 'References', 'Supplemental Information'], note: '要求 STAR Methods 结构化方法段与关键资源表。', url: 'https://www.cell.com/cell/authors' },
  { name: 'PNAS', field: '综合 · 科学院院刊', style: 'vancouver', words: '约 4000 词 / 6 个版面', abs: '约 250 词结构化要求低', sections: ['Title', 'Significance Statement', 'Abstract', 'Introduction', 'Results', 'Discussion', 'Materials and Methods', 'References'], note: '必填 Significance Statement（约 120 词）。', url: 'https://www.pnas.org/author-center/initial-submission' },
  { name: 'Nature Biotechnology', field: '生物技术', style: 'nature', words: '约 3000 词', abs: '无小标题单段摘要', sections: ['Title', 'Abstract', 'Main', 'Methods', 'Data availability', 'References', 'Acknowledgements'], note: '方法与技术验证需完整，鼓励提供可复现代码与数据。', url: 'https://www.nature.com/nbt/for-authors' },
  { name: 'PLOS ONE', field: '综合 · 开放获取', style: 'vancouver', words: '不限（建议 < 5000 词）', abs: '约 300 词，可结构化', sections: ['Title', 'Abstract', 'Introduction', 'Materials and Methods', 'Results', 'Discussion', 'Conclusions', 'References', 'Supporting Information'], note: '以方法严谨性而非创新性为录用标准；强制 Data Availability Statement。', url: 'https://journals.plos.org/plosone/s/submission-guidelines' },
  { name: 'The Lancet', field: '医学 · 临床', style: 'vancouver', words: '约 3000 词', abs: '结构化摘要（Background/Methods/Findings/Interpretation）', sections: ['Title', 'Abstract', 'Introduction', 'Methods', 'Results', 'Discussion', 'References', 'Appendix'], note: 'Article 需结构化摘要，临床试验须注册号与 CONSORT。', url: 'https://www.thelancet.com/lancet/information-for-authors' },
  { name: 'JAMA', field: '医学 · 临床', style: 'vancouver', words: '约 3000 词', abs: '结构化摘要（Importance/Objective/Design/Results/Conclusions）', sections: ['Title', 'Abstract', 'Introduction', 'Methods', 'Results', 'Discussion', 'Conclusions', 'References'], note: '结构化摘要与试验注册为硬性要求。', url: 'https://jamanetwork.com/journals/jama/pages/instructions-for-authors' },
  { name: 'IEEE TPAMI', field: '计算机 · 人工智能', style: 'ieee', words: '约 8000-10000 词（Regular Paper）', abs: '约 200 词，无引用', sections: ['Title', 'Abstract', 'Index Terms', 'Introduction', 'Related Work', 'Proposed Method', 'Theoretical Analysis', 'Experiments', 'Conclusion', 'References', 'Appendix'], note: 'IEEE 双栏模板；需 Index Terms；参考文献方括号数字编号。', url: 'https://www.computer.org/csdl/journal/tp/author-guidelines' },
  { name: 'Journal of Machine Learning Research', field: '机器学习', style: 'apa', words: '不限', abs: '约 150-250 词', sections: ['Title', 'Abstract', 'Keywords', 'Introduction', 'Background', 'Method', 'Experiments', 'Related Work', 'Conclusion', 'References', 'Appendix'], note: 'JMLR 自带 LaTeX 样式；强调理论或实证的完备性。', url: 'https://www.jmlr.org/author-info.html' },
  { name: 'Advanced Materials', field: '材料科学', style: 'vancouver', words: '约 3000 词（Communication 更短）', abs: '约 150 词', sections: ['Title', 'Abstract', 'Main Text', 'Experimental Section', 'Acknowledgements', 'References', 'Supporting Information'], note: '需 TOC 图与一句话亮点说明。', url: 'https://onlinelibrary.wiley.com/page/journal/15214095/homepage/forauthors.html' },
  { name: '科学通报', field: '中文综合 · 国内期刊', style: 'gbt7714', words: '约 5000 字', abs: '中英文摘要各约 200 字', sections: ['题目', '摘要', '关键词', '引言', '材料与方法', '结果', '讨论', '结论', '参考文献', '致谢', '补充材料'], note: '执行 GB/T 7714-2015 著录格式，需中英文题名与摘要。', url: 'https://www.sciengine.com/CSB/doi/10.1360/TB-2020-0001' },
  { name: '经济研究', field: '中文 · 经济学', style: 'gbt7714', words: '约 12000 字', abs: '约 300 字 + JEL 分类号', sections: ['题目', '内容提要', '关键词', 'JEL 分类号', '一、引言', '二、文献综述', '三、模型与数据', '四、实证结果', '五、结论', '参考文献'], note: '中文脚注与文后参考文献并用，需 JEL 分类。', url: 'http://www.erj.cn' },
  { name: '自定义期刊', field: '通用', style: 'apa', words: '按投稿指南', abs: '按投稿指南', sections: ['Title', 'Abstract', 'Keywords', 'Introduction', 'Methods', 'Results', 'Discussion', 'Conclusion', 'References', 'Acknowledgements'], note: '通用 IMRaD 骨架，结构可在生成后自行增删。', url: '' }
];

PD.template = function (j, title) {
  const t = title || '（在此填写论文题名）';
  return '# ' + t + '\n\n> 目标期刊：' + j.name + ' ｜ ' + j.field + '\n> 篇幅：' + j.words + '\n> 摘要要求：' + j.abs + '\n> 参考文献样式：' + ({ gbt7714: 'GB/T 7714-2015', apa: 'APA 7th', vancouver: 'Vancouver', nature: 'Nature', ieee: 'IEEE', chicago: 'Chicago', mla: 'MLA 9' }[j.style] || j.style) + '\n\n' +
    j.sections.map((s, i) => {
      if (s === 'Title' || s === '题目') return '';
      const hint = {
        'Abstract': '背景一句话 → 待解决问题 → 方法 → 主要结果（含关键数据）→ 结论与意义。',
        '摘要': '研究目的、方法、主要发现、结论，中文约 200 字；避免引用与缩写。',
        'Summary': '用非专业读者能懂的语言概括发现与意义。',
        'Significance Statement': '用 120 词左右说明为什么公众/领域外读者应关心这项工作。',
        'Introduction': '领域背景 → 已有工作与缺口 → 本文贡献（建议 3 段，末段列贡献点）。',
        '引言': '研究背景 → 文献述评 → 边际贡献与结构安排。',
        'Keywords': '3-6 个检索词，避免与题名完全重复。',
        '关键词': '3-6 个，用分号分隔。',
        'Methods': '样本/数据/设备/算法/统计方法，细致到可复现；注明伦理与数据可得性。',
        'Materials and Methods': '材料来源、实验流程、参数设置、统计检验与软件版本。',
        '方法': '数据来源、变量定义、模型设定与识别策略。',
        'Results': '按逻辑而非时间顺序组织，每张图表一句话结论。',
        '结果': '核心估计结果、稳健性检验与异质性分析。',
        'Discussion': '解释、与既有文献对照、局限与展望。',
        '讨论': '机制解释、与文献对话、政策含义与局限。',
        'Conclusion': '凝练结论，不重复结果段数据。',
        '结论': '主要结论与建议，不引入新结果。',
        'References': '由「边写边引」自动生成，切换样式时全文重排；此处留空即可。',
        '参考文献': '由「边写边引」自动生成，执行 GB/T 7714-2015。',
        'Index Terms': 'IEEE 关键词，按字母序。',
        'Cover Letter': '编辑称谓 → 一句话创新点 → 为什么适合本刊 → 原创性与无一稿多投声明。',
        'STAR Methods': 'Key Resources Table + Method Details + Quantification and Statistical Analysis。',
        'Data availability': '数据存放库、 accession number 或获取限制说明。',
        'Competing interests': '声明无利益冲突或具体披露。'
      }[s];
      return '## ' + (i + 1) + '. ' + s + '\n\n' + (hint ? '<!-- ' + hint + ' -->\n\n' : '') + '（在此撰写）\n';
    }).filter(Boolean).join('\n') +
    '\n---\n投稿提示：' + j.note + (j.url ? '\n官方作者指南：' + j.url : '') + '\n';
};
})();
