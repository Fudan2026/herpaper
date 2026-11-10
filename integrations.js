/* HerPaper integrations: CSL-JSON interop, OpenAlex citation chains, Zotero bridge client.
   Loaded after core.js and before app.js. All functions attach to window.PD. */
(function () {
'use strict';
const PD = window.PD;
const OA = 'https://api.openalex.org';
const MAIL = 'mailto=research@example.com';
const WORK_SELECT = 'id,doi,display_name,publication_year,publication_date,cited_by_count,authorships,primary_location,open_access,fwci,citation_normalized_percentile,primary_topic,keywords,abstract_inverted_index,biblio,ids,type,counts_by_year,referenced_works,related_works,is_retracted';

/* ---------- 旧版本数据迁移（产品更名后不丢库） ---------- */
try {
  const OLD = 'paperdesk.state.v1', NEW = 'herpaper.state.v1';
  if (!localStorage.getItem(NEW) && localStorage.getItem(OLD)) {
    localStorage.setItem(NEW, localStorage.getItem(OLD));
  }
} catch (e) { }

/* ---------- CSL-JSON：与 Zotero 生态的通用交换格式 ---------- */
const T2C = {
  journalArticle: 'article-journal', book: 'book', bookSection: 'chapter',
  conferencePaper: 'paper-conference', thesis: 'thesis', report: 'report',
  webpage: 'webpage', dataset: 'dataset', preprint: 'manuscript',
  magazineArticle: 'article-magazine', newspaperArticle: 'article-newspaper', review: 'article-journal'
};
const C2T = {};
Object.keys(T2C).forEach(k => { if (!C2T[T2C[k]]) C2T[T2C[k]] = k; });

PD.toCSL = function (it) {
  const csl = {
    id: it.key || it.doi || it.id,
    type: T2C[it.type] || 'article-journal',
    title: it.title || '',
    author: (it.authors || []).map(a => {
      const s = String(a || '');
      if (s.includes(',')) {
        const seg = s.split(',');
        return { family: seg[0].trim(), given: seg.slice(1).join(',').trim() };
      }
      const p = s.trim().split(/\s+/);
      const family = p.pop() || s;
      return { family, given: p.join(' ') };
    }),
    'container-title': it.journal || undefined,
    DOI: it.doi || undefined,
    URL: it.url || undefined,
    abstract: it.abstract || undefined,
    volume: it.volume || undefined,
    issue: it.issue || undefined,
    page: it.pages || undefined,
    keyword: (it.tags || []).join(', ') || undefined,
    custom: {
      version: it.version || 0,
      synced: it.synced !== false,
      zoteroKey: it.key || undefined,
      openalexId: it.oaId || undefined,
      citedByCount: it.citedBy || 0,
      fwci: it.fwci === null || it.fwci === undefined ? undefined : it.fwci,
      ut: it.ut || undefined,
      groups: (it.groups || []).length ? it.groups : undefined,
      note: it.note || undefined
    }
  };
  if (it.year) csl.issued = { 'date-parts': [[Number(it.year)]] };
  return Object.fromEntries(Object.entries(csl).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
};

PD.fromCSL = function (c) {
  if (!c || typeof c !== 'object') return null;
  const parts = ((c.issued || {})['date-parts'] || [[null]])[0] || [];
  const custom = c.custom || {};
  return {
    id: PD.uid(),
    key: c.id || custom.zoteroKey || '',
    title: c.title || '',
    authors: (c.author || []).map(a => a.literal || ([a.given, a.family].filter(Boolean).join(' ') || '')),
    year: parts[0] ? String(parts[0]) : '',
    journal: c['container-title'] || c['container-title-short'] || '',
    doi: PD.normDOI(c.DOI), pmid: '', ut: custom.ut || '',
    type: C2T[c.type] || c.type || '', volume: c.volume || '', issue: c.issue || '',
    pages: c.page || '', abstract: c.abstract || '',
    citedBy: PD.num(custom.citedByCount), countsByYear: [],
    fwci: custom.fwci === undefined ? null : custom.fwci, percentile: null,
    concepts: [], oaUrl: '', url: c.URL || (c.DOI ? 'https://doi.org/' + PD.normDOI(c.DOI) : ''),
    oaId: custom.openalexId || '', related: [],
    tags: c.keyword ? String(c.keyword).split(/[,;]/).map(s => s.trim()).filter(Boolean) : [],
    groups: custom.groups || [], starred: false, read: false, note: custom.note || '',
    version: PD.num(custom.version), synced: custom.synced !== false,
    addedAt: Date.now(), source: 'CSL-JSON'
  };
};

PD.exportCSL = function (items) {
  return JSON.stringify((items || []).map(PD.toCSL), null, 2);
};
PD.parseCSLText = function (text) {
  const d = JSON.parse(String(text).replace(/^\ufeff/, ''));
  const arr = Array.isArray(d) ? d : (d.items || []);
  return arr.map(PD.fromCSL).filter(Boolean);
};
PD.isCSLArray = function (arr) {
  return Array.isArray(arr) && arr.length > 0 && arr[0] &&
    typeof arr[0] === 'object' && ('type' in arr[0]) && ('title' in arr[0]) && !('authors' in arr[0]);
};

/* ---------- OpenAlex 引文链条（真实 API，无占位符） ---------- */
PD.citationChain = async function (it, opts) {
  const o = opts || {};
  let id = it.oaId;
  if (!id && it.doi) {
    const d = await PD.fetchJSON(OA + '/works/doi:' + encodeURIComponent(it.doi) + '?' + MAIL);
    id = String(d.id || '').split('/').pop();
  }
  if (!id) throw new Error('该条目没有 OpenAlex ID 或 DOI，无法展开引文链条');
  const seed = await PD.fetchJSON(OA + '/works/' + id + '?' + MAIL);
  const refIds = (seed.referenced_works || []).slice(0, o.out || 25).map(x => String(x).split('/').pop());
  const relIds = (seed.related_works || []).slice(0, 10).map(x => String(x).split('/').pop());
  const batch = async ids => {
    if (!ids.length) return [];
    const d = await PD.fetchJSON(OA + '/works?filter=openalex_id:' + encodeURIComponent(ids.join('|')) +
      '&per-page=' + Math.min(100, ids.length) + '&select=' + WORK_SELECT + '&' + MAIL);
    return (d.results || []).map(PD.normWork);
  };
  const inc = await PD.fetchJSON(OA + '/works?filter=cites:' + id +
    '&sort=cited_by_count:desc&per-page=' + (o.incoming || 10) + '&select=' + WORK_SELECT + '&' + MAIL);
  return {
    seed: {
      id, title: seed.display_name || seed.title || '', doi: PD.normDOI(seed.doi),
      citedBy: PD.num(seed.cited_by_count), fwci: seed.fwci,
      totalReferences: (seed.referenced_works || []).length,
      isRetracted: !!seed.is_retracted,
      citedByApiUrl: seed.cited_by_api_url || ''
    },
    outgoing: await batch(refIds),
    incoming: (inc.results || []).map(PD.normWork),
    incomingTotal: (inc.meta || {}).count || 0,
    related: await batch(relIds)
  };
};

/* ---------- Zotero 桥接客户端（仅本机服务模式可用） ---------- */
async function call(path, method, body) {
  const r = await fetch(path, {
    method: method || 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json().catch(() => ({ error: 'HTTP ' + r.status }));
  if (!r.ok || d.error) throw new Error(d.error || d.hint || ('HTTP ' + r.status));
  return d;
}

PD.zotero = {
  enabled: () => !PD.staticHost,
  status: async () => PD.staticHost
    ? { available: false, reason: 'static', hint: 'GitHub Pages 是静态托管，无法访问本机 23119 端口。请运行 herpaper/start.command 后从 http://127.0.0.1:8765 打开。' }
    : call('/zotero/status'),
  config: cfg => call('/zotero/config', 'POST', cfg),
  pull: mode => call('/zotero/sync?mode=' + encodeURIComponent(mode || 'local')),
  push: (mode, items) => call('/zotero/push?mode=' + encodeURIComponent(mode || 'local'), 'POST', { items }),
  authorize: () => call('/zotero/authorize', 'POST', { appName: 'HerPaper' }),
  render: (style, format) => call('/zotero/render?style=' + encodeURIComponent(style) + '&format=' + encodeURIComponent(format || 'bib'))
};
})();
