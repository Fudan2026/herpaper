/* PaperDesk UI：九个视图的渲染与交互 */
(async function () {
'use strict';
const $ = id => document.getElementById(id);
const esc = PD.esc;
const lib = () => PD.state.library;
const find = id => lib().find(x => x.id === id);
const sel = new Set();
let view = 'v1', page = 1, query = null, total = 0;
let templateText = '', templateJournal = PD.JOURNALS[0], matchList = [];

/* 只读分享页：直接输出自包含快照，不进入主应用 */
if (location.pathname.indexOf('/share/') === 0) {
  const sid = location.pathname.split('/').filter(Boolean).pop();
  try {
    const r = await fetch('/api/share/' + encodeURIComponent(sid));
    const s = await r.json();
    if (s && !s.error) {
      document.open();
      document.write(PD.exportHTML(s.items || [], s.name || '共享文献图书馆', s.note));
      document.close();
    } else document.body.innerHTML = '<div style="padding:60px;font-family:sans-serif">该分享链接不存在或已失效。</div>';
  } catch (e) { document.body.innerHTML = '<div style="padding:60px;font-family:sans-serif">无法读取分享内容，请确认本地服务已启动。</div>'; }
  return;
}

await PD.init();

/* ---------- 通用 ---------- */
function updateHeader() {
  $('libCount').textContent = lib().length;
  $('modeBadge').textContent = PD.serverMode ? '服务端同步' : (PD.staticHost ? '云端页面 · 本机存储' : '本机存储');
  $('statusDot').className = 'dot ' + (PD.serverMode ? 'on' : 'warn');
  $('statusText').textContent = PD.serverMode ? '服务端已连接 · 自动保存' : (PD.staticHost ? '静态托管 · 浏览器本地保存' : '本地自动保存 · 可导出备份');
  const d = PD.state.updatedAt ? new Date(PD.state.updatedAt) : null;
  $('statusText').title = d ? '最近保存：' + d.toLocaleString('zh-CN') : '';
}
PD.onState = updateHeader;

const NAV = {
  v1: ['01', '检索建库'], v2: ['02', '跨平台同步'], v3: ['03', '全记录与相关文献'],
  v4: ['04', '引文报告'], v5: ['05', '管理与分析'], v6: ['06', '共享协同'],
  v7: ['07', '边写边引'], v8: ['08', '投稿模板'], v9: ['09', '期刊匹配']
};
function go(v) {
  view = v;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === v));
  $('crumbNum').textContent = NAV[v][0]; $('crumbTitle').textContent = NAV[v][1];
  document.querySelector('.content').scrollTop = 0;
}

function modal(title, html) {
  $('modalTitle').textContent = title; $('modalBody').innerHTML = html;
  $('modal').classList.remove('hidden');
}
function closeModal() { $('modal').classList.add('hidden'); }
function ask(title, def, cb) {
  modal(title, '<label class="field"><span>输入内容</span><input id="askInput" class="inp" value="' + esc(def || '') + '"></label><div class="row-end"><button class="btn primary" id="askOk">确定</button></div>');
  const inp = $('askInput'); inp.focus(); inp.select();
  const done = () => { const v = inp.value.trim(); closeModal(); cb(v); };
  $('askOk').onclick = done;
  inp.onkeydown = e => { if (e.key === 'Enter') done(); };
}
function confirmBox(title, cb) {
  modal(title, '<p class="para">' + esc(title) + '</p><div class="row-end"><button class="btn" id="askNo">取消</button> <button class="btn primary" id="askYes">确定</button></div>');
  $('askNo').onclick = closeModal;
  $('askYes').onclick = () => { closeModal(); cb(); };
}
function itemMeta(it) {
  const a = (it.authors || []);
  return [a.length ? (a[0] + (a.length > 1 ? ' 等 ' + a.length + ' 人' : '')) : '作者未知',
    it.journal || '期刊未知', it.year || '年份未知'].join(' · ');
}
function linksRow(it) {
  const w = PD.wosURL(it), d = PD.doiURL(it), o = PD.openalexURL(it), p = PD.pmidURL(it);
  return '<div class="btn-row" style="margin-top:7px">' +
    '<a class="btn small primary" target="_blank" href="' + esc(w) + '">WoS 全记录 ↗</a>' +
    (o ? '<a class="btn small" target="_blank" href="' + esc(o) + '">OpenAlex 全记录 ↗</a>' : '') +
    (d ? '<a class="btn small" target="_blank" href="' + esc(d) + '">DOI ↗</a>' : '') +
    (p ? '<a class="btn small" target="_blank" href="' + esc(p) + '">PubMed ↗</a>' : '') +
    (it.oaUrl ? '<a class="btn small" target="_blank" href="' + esc(it.oaUrl) + '">开放全文 ↗</a>' : '') +
    '</div>';
}

/* ---------- 01 检索 ---------- */
function renderChips() {
  const samples = ['CRISPR gene editing', 'single-cell RNA sequencing', 'large language model reasoning', 'perovskite solar cell'];
  $('chips').innerHTML = samples.map(s => '<button class="chip" data-act="chip" data-q="' + esc(s) + '">' + esc(s) + '</button>').join('') +
    '<button class="chip" data-act="demo">载入示例专题（5 篇）</button>';
}
async function doSearch(p) {
  const q = $('q').value.trim();
  if (!q) { PD.toast('先输入关键词或 DOI'); return; }
  page = p || 1;
  query = { q, source: $('source').value, from: $('yearFrom').value, to: $('yearTo').value, type: $('typeFilter').value, oa: $('oaOnly').checked };
  $('searchResults').innerHTML = '<div class="empty">正在检索…</div>';
  try {
    const r = await PD.search(Object.assign({}, query, { page }));
    PD.searchResults = r.items; total = r.total;
    renderResults();
  } catch (e) { $('searchResults').innerHTML = '<div class="empty">检索失败：' + esc(e.message) + '<br>可改用「粘贴导入」，或在本地服务模式下由代理转发。</div>'; }
}
function renderResults() {
  const box = $('searchResults');
  if (!PD.searchResults.length) { box.innerHTML = '<div class="empty">没有匹配结果，换个关键词或数据源试试。</div>'; }
  else box.innerHTML = PD.searchResults.map(it =>
    '<div class="result"><div class="result-main"><h3>' + esc(it.title) + '</h3>' +
    '<div class="meta"><span>' + esc(it.journal || '—') + '</span><span>' + esc(it.year || '—') + '</span>' +
    '<span>被引 ' + (it.citedBy || 0) + '</span>' + (it.oaUrl ? '<span class="tag green">开放获取</span>' : '') +
    (it.doi ? '<span>' + esc(it.doi) + '</span>' : '') + '</div>' +
    '<div class="meta">' + esc((it.authors || []).slice(0, 4).join(', ')) + '</div>' +
    (it.abstract ? '<div class="abs">' + esc(it.abstract.slice(0, 240)) + '</div>' : '') +
    '<div>' + (it.concepts || []).slice(0, 4).map(c => '<span class="tag brand">' + esc(c) + '</span>').join('') + '</div>' +
    '</div><div class="result-actions"><button class="btn small primary" data-act="add-one" data-id="' + esc(it.id) + '">加入库</button>' +
    '<a class="btn small" target="_blank" href="' + esc(PD.wosURL(it)) + '">WoS ↗</a></div></div>'
  ).join('');
  $('pageInfo').textContent = '第 ' + page + ' 页 · 约 ' + total.toLocaleString() + ' 条命中';
}

async function enrichImported(items) {
  const dois = Array.from(new Set(items.filter(x => x.doi && (!x.authors.length || !x.journal)).map(x => x.doi))).slice(0, 80);
  if (!dois.length) return;
  PD.toast('正在联网补全 ' + dois.length + ' 条元数据…', 4000);
  try {
    const got = await PD.lookupDOIs(dois, (a, b) => { if (a === b) PD.toast('已补全 ' + a + '/' + b + ' 条'); });
    const m = new Map(got.map(x => [x.doi, x]));
    lib().forEach(it => {
      const w = m.get(it.doi); if (!w) return;
      ['journal', 'abstract', 'volume', 'issue', 'pages', 'pmid', 'oaUrl', 'url', 'oaId', 'fwci', 'percentile'].forEach(f => { if (!it[f] && w[f]) it[f] = w[f]; });
      if (!it.authors.length) it.authors = w.authors;
      if (!it.year) it.year = w.year;
      if (w.citedBy > (it.citedBy || 0)) { it.citedBy = w.citedBy; it.countsByYear = w.countsByYear; }
      if (w.concepts.length) it.concepts = w.concepts;
      if (w.related.length) it.related = w.related;
    });
    PD.save(); renderAll();
    PD.toast('元数据补全完成');
  } catch (e) { PD.toast('补全未成功，条目已保留原始信息'); }
}

async function handleFiles(files) {
  let all = [], restored = null, doiList = [];
  for (const f of Array.from(files)) {
    const text = await f.text();
    const r = PD.parseAny(text, f.name);
    if (r.state) restored = r.state;
    if (r.items && r.items.length) all = all.concat(r.items);
    if (r.dois && r.dois.length) doiList = doiList.concat(r.dois);
    if (r.error) PD.toast(f.name + '：' + r.error);
  }
  if (restored) { restoreState(restored); return; }
  if (doiList.length) {
    PD.toast('正在解析 ' + doiList.length + ' 个 DOI…');
    const got = await PD.lookupDOIs(doiList);
    all = all.concat(got);
  }
  if (!all.length) { PD.toast('没有解析出文献'); return; }
  const r = PD.addItems(all);
  renderAll();
  enrichImported(all);
  PD.toast('导入完成：新增 ' + r.added + ' 篇，补全 ' + r.updated + ' 篇');
}
function restoreState(s) {
  if (!lib().length) {
    PD.state = Object.assign(PD.state, s);
    PD.state.settings = Object.assign({ style: 'gbt7714', citeMode: 'numbered', journal: '' }, s.settings || {});
    PD.saveNow(); renderAll(); PD.toast('备份已还原：' + lib().length + ' 篇');
  } else {
    const r = PD.addItems(s.library || []);
    PD.saveNow(); renderAll(); PD.toast('已与现有库合并：新增 ' + r.added + ' 篇');
  }
}
async function loadDemo() {
  const dois = ['10.1038/nbt.3439', '10.1126/science.1258096', '10.1038/nature14539', '10.1038/s41586-021-03819-2', '10.1053/j.ajkd.2018.02.347'];
  PD.toast('正在载入示例专题…');
  const got = await PD.lookupDOIs(dois);
  if (!got.length) { PD.toast('示例数据获取失败，请直接检索'); return; }
  PD.addItems(got, true); renderAll(); PD.toast('示例专题已加入：' + got.length + ' 篇');
}

/* ---------- 02 同步 ---------- */
function renderSync() {
  const last = PD.state.updatedAt ? new Date(PD.state.updatedAt).toLocaleString('zh-CN') : '尚未保存';
  $('syncStats').innerHTML = [
    ['存储方式', PD.serverMode ? '服务端' : '本机', PD.serverMode ? 'data/state.json' : '浏览器 localStorage'],
    ['文献总数', lib().length, '含 ' + PD.state.groups.length + ' 个分组'],
    ['最近保存', last.length > 18 ? last.slice(0, 18) : last, '所有改动 0.7 秒后自动写入']
  ].map(x => '<div class="stat"><div class="k">' + x[0] + '</div><div class="v" style="font-size:' + (x[0] === '最近保存' ? '15px' : '24px') + '">' + esc(String(x[1])) + '</div><div class="s">' + esc(x[2]) + '</div></div>').join('');
}
function currentItems() { return lib(); }
function doExport(kind) {
  const L = lib(), ts = new Date().toISOString().slice(0, 10);
  if (!L.length && kind !== 'json') { PD.toast('库里还没有文献'); return; }
  if (kind === 'json') { PD.download('paperdesk-backup-' + ts + '.json', JSON.stringify(PD.state, null, 1), 'application/json'); PD.toast('完整备份已导出（含分组与文稿）'); return; }
  if (kind === 'ris') PD.download('paperdesk-' + ts + '.ris', PD.exportRIS(L), 'application/x-research-info-systems');
  if (kind === 'bib') PD.download('paperdesk-' + ts + '.bib', PD.exportBib(L), 'application/x-bibtex');
  if (kind === 'csv') PD.download('paperdesk-' + ts + '.csv', PD.exportCSV(L), 'text/csv');
  if (kind === 'html') PD.download('paperdesk-snapshot-' + ts + '.html', PD.exportHTML(L, 'PaperDesk 文献库', '共 ' + L.length + ' 篇 · 自包含只读快照'), 'text/html');
  if (kind === 'group-ris' || kind === 'group-bib') {
    const g = $('shareGroup').value;
    const items = g === '__all' ? L : L.filter(x => (x.groups || []).includes(g));
    if (!items.length) { PD.toast('该分组暂无文献'); return; }
    PD.download('paperdesk-group-' + ts + (kind === 'group-ris' ? '.ris' : '.bib'), kind === 'group-ris' ? PD.exportRIS(items) : PD.exportBib(items), 'text/plain');
  }
  PD.toast('已导出');
}

/* ---------- 03 全记录 ---------- */
function renderWos() {
  const L = lib();
  $('wosList').innerHTML = L.length ? L.map(it =>
    '<div class="li"><div class="li-main"><div class="li-title">' + esc(it.title) + '</div>' +
    '<div class="muted">' + esc(itemMeta(it)) + (it.ut ? ' · <span class="tag brand">WoS 入藏号 ' + esc(it.ut) + '</span>' : ' · <span class="tag amber">以 DOI/题名跳转</span>') + '</div>' +
    linksRow(it) + '</div>' +
    '<button class="btn small" data-act="related" data-id="' + esc(it.id) + '" ' + (it.related && it.related.length ? '' : 'disabled title="暂无相关记录，先在引文报告刷新数据"') + '>相关记录</button></div>'
  ).join('') : '<div class="empty">库是空的，先在「检索建库」收几篇文献。</div>';
}
async function showRelated(id) {
  const it = find(id);
  $('relatedCard').hidden = false;
  $('relatedTitle').textContent = '相关记录 · ' + (it.title || '').slice(0, 40);
  $('relatedBox').innerHTML = '<div class="empty">正在拉取 OpenAlex 相关记录…</div>';
  const items = await PD.related(it.related);
  PD.relatedItems = items;
  $('relatedBox').innerHTML = items.length ? items.map(x =>
    '<div class="li"><div class="li-main"><div class="li-title">' + esc(x.title) + '</div><div class="muted">' + esc(itemMeta(x)) + ' · 被引 ' + x.citedBy + '</div></div><button class="btn small" data-act="add-related" data-id="' + esc(x.id) + '">加入库</button></div>'
  ).join('') : '<div class="empty">没有取到相关记录，可先在引文报告里刷新数据补全 OpenAlex ID。</div>';
}

/* ---------- 04 引文报告 ---------- */
function reportData() {
  const L = lib();
  const cites = L.map(x => PD.num(x.citedBy)).sort((a, b) => b - a);
  let h = 0; cites.forEach((c, i) => { if (c >= i + 1) h = i + 1; });
  const yearMap = new Map();
  L.forEach(it => (it.countsByYear || []).forEach(y => yearMap.set(y.year, (yearMap.get(y.year) || 0) + PD.num(y.cited_by_count))));
  return {
    L, total: L.length, sum: cites.reduce((a, b) => a + b, 0), mean: L.length ? (cites.reduce((a, b) => a + b, 0) / L.length).toFixed(1) : 0,
    max: cites[0] || 0, h, yearMap,
    top: L.slice().sort((a, b) => PD.num(b.citedBy) - PD.num(a.citedBy)).slice(0, 10),
    journals: PD.topN(L, x => x.journal ? [x.journal] : [], 10),
    oa: L.filter(x => x.oaUrl).length,
    fwci: L.filter(x => x.fwci != null),
    top10: L.filter(x => x.percentile != null && x.percentile >= 0.9).length
  };
}
function renderReport() {
  const r = reportData();
  $('reportSummary').innerHTML = [
    ['文献总数', r.total, '当前分析范围'], ['总被引', r.sum.toLocaleString(), 'OpenAlex / Europe PMC'],
    ['篇均被引', r.mean, '总被引 ÷ 文献数'], ['h 指数', r.h, '基于本库被引分布']
  ].map(x => '<div class="stat"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + '</div><div class="s">' + x[2] + '</div></div>').join('');
  const years = Array.from(r.yearMap, ([label, value]) => ({ label: String(label), value })).sort((a, b) => a.label.localeCompare(b.label)).slice(-12);
  $('reportYear').innerHTML = PD.vbars(years, '逐年被引次数（近 12 年）');
  $('reportTop').innerHTML = r.top.length ? '<table><thead><tr><th>#</th><th>题名</th><th>年份</th><th>被引</th></tr></thead><tbody>' +
    r.top.map((it, i) => '<tr><td>' + (i + 1) + '</td><td class="td-title" data-act="edit" data-id="' + esc(it.id) + '">' + esc(it.title.slice(0, 80)) + '</td><td>' + esc(it.year) + '</td><td><b>' + it.citedBy + '</b></td></tr>').join('') + '</tbody></table>' : '<div class="empty">暂无数据</div>';
  $('reportJournals').innerHTML = PD.hbars(r.journals);
  const avgFwci = r.fwci.length ? (r.fwci.reduce((a, b) => a + PD.num(b.fwci), 0) / r.fwci.length).toFixed(2) : '—';
  const recent = Array.from(r.yearMap).filter(([y]) => Number(y) >= new Date().getFullYear() - 2).reduce((a, [, v]) => a + v, 0);
  $('reportExtra').innerHTML = '<div class="grid2" style="gap:10px">' + [
    ['平均 FWCI', avgFwci, '领域归一化引用影响，>1 高于世界均值'],
    ['前 10% 高被引', r.top10, '按 OpenAlex 引文百分位'],
    ['近两年被引', recent, '本年度与前一年合计'],
    ['开放获取', r.oa + ' / ' + r.total, '可公开获取全文的条目']
  ].map(x => '<div class="stat"><div class="k">' + x[0] + '</div><div class="v" style="font-size:20px">' + x[1] + '</div><div class="s">' + x[2] + '</div></div>').join('') + '</div>';
  $('citeHint').textContent = r.L.length ? '上次刷新后共 ' + r.L.length + ' 篇 · 点击刷新获取最新被引' : '库为空，先去检索建库';
}
async function refreshCites() {
  if (!lib().length) { PD.toast('库是空的'); return; }
  const b = $('btnRefreshCites'); b.disabled = true;
  try {
    await PD.refresh(lib(), (a, t) => { b.textContent = '刷新中 ' + a + '/' + t; });
    PD.saveNow(); renderAll(); PD.toast('被引数据已更新');
  } catch (e) { PD.toast('刷新失败：' + e.message); }
  b.disabled = false; b.textContent = '刷新被引数据';
}

/* ---------- 05 管理分析 ---------- */
function filteredItems() {
  const q = $('filterQ').value.trim().toLowerCase(), g = $('filterGroup').value, t = $('filterTag').value, sort = $('filterSort').value;
  let arr = lib().filter(it => {
    if (g && !(it.groups || []).includes(g)) return false;
    if (t && !(it.tags || []).includes(t)) return false;
    if (q) {
      const hay = [it.title, it.abstract, (it.authors || []).join(' '), it.journal, it.doi, (it.tags || []).join(' '), (it.concepts || []).join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (sort === 'year') arr.sort((a, b) => PD.num(b.year) - PD.num(a.year));
  else if (sort === 'cited') arr.sort((a, b) => PD.num(b.citedBy) - PD.num(a.citedBy));
  else if (sort === 'title') arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  else arr.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  return arr;
}
function renderLibrary() {
  const arr = filteredItems();
  $('libTable').innerHTML = arr.length ? '<table><thead><tr><th><input type="checkbox" id="selAll"></th><th>题名</th><th>第一作者</th><th>年份</th><th>期刊</th><th>被引</th><th>分组 / 标签</th><th></th></tr></thead><tbody>' +
    arr.map(it => '<tr><td><input type="checkbox" data-act="sel" data-id="' + esc(it.id) + '" ' + (sel.has(it.id) ? 'checked' : '') + '></td>' +
      '<td class="td-title" data-act="edit" data-id="' + esc(it.id) + '">' + (it.starred ? '★ ' : '') + esc((it.title || '').slice(0, 110)) + '</td>' +
      '<td>' + esc((it.authors || [])[0] || '—') + '</td><td>' + esc(it.year || '—') + '</td><td>' + esc((it.journal || '—').slice(0, 30)) + '</td>' +
      '<td><b>' + (it.citedBy || 0) + '</b></td><td>' +
      (it.groups || []).map(g => '<span class="tag brand">' + esc(g) + '</span>').join('') +
      (it.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</td>' +
      '<td><button class="btn small" data-act="edit" data-id="' + esc(it.id) + '">编辑</button></td></tr>').join('') +
    '</tbody></table>' : '<div class="empty">' + (lib().length ? '没有符合筛选条件的文献' : '库是空的，去「检索建库」收文献') + '</div>';
  const sa = $('selAll'); if (sa) sa.onchange = e => { arr.forEach(x => e.target.checked ? sel.add(x.id) : sel.delete(x.id)); renderLibrary(); };
}
function renderCharts() {
  const L = lib();
  const years = PD.topN(L, x => x.year ? [String(x.year)] : [], 12).sort((a, b) => a.label.localeCompare(b.label));
  $('chartYear').innerHTML = PD.vbars(years, '按发表年份');
  $('chartJournal').innerHTML = PD.hbars(PD.topN(L, x => x.journal ? [x.journal] : [], 10));
  $('chartTopic').innerHTML = PD.hbars(PD.topN(L, x => (x.concepts || []).slice(0, 3), 10));
  $('chartAuthor').innerHTML = PD.hbars(PD.topN(L, x => (x.authors || []).slice(0, 3), 10));
}
function editItem(id) {
  const it = find(id); if (!it) return;
  const groups = PD.state.groups.map(g => '<label class="chk" style="margin-right:10px"><input type="checkbox" class="eg" value="' + esc(g) + '" ' + ((it.groups || []).includes(g) ? 'checked' : '') + '> ' + esc(g) + '</label>').join('') || '<span class="muted">尚未建立分组</span>';
  modal('编辑文献', [
    '<label class="field"><span>题名</span><input id="ef_title" class="inp" value="' + esc(it.title) + '"></label>',
    '<label class="field"><span>作者（逗号分隔）</span><input id="ef_authors" class="inp" value="' + esc((it.authors || []).join(', ')) + '"></label>',
    '<div class="grid2"><label class="field"><span>年份</span><input id="ef_year" class="inp" value="' + esc(it.year) + '"></label>',
    '<label class="field"><span>期刊</span><input id="ef_journal" class="inp" value="' + esc(it.journal) + '"></label></div>',
    '<div class="grid2"><label class="field"><span>DOI</span><input id="ef_doi" class="inp" value="' + esc(it.doi) + '"></label>',
    '<label class="field"><span>WoS 入藏号 UT</span><input id="ef_ut" class="inp" value="' + esc(it.ut) + '" placeholder="WOS:000…"></label></div>',
    '<div class="grid3"><label class="field"><span>卷</span><input id="ef_volume" class="inp" value="' + esc(it.volume) + '"></label>',
    '<label class="field"><span>期</span><input id="ef_issue" class="inp" value="' + esc(it.issue) + '"></label>',
    '<label class="field"><span>页码</span><input id="ef_pages" class="inp" value="' + esc(it.pages) + '"></label></div>',
    '<label class="field"><span>标签（逗号分隔）</span><input id="ef_tags" class="inp" value="' + esc((it.tags || []).join(', ')) + '"></label>',
    '<label class="field"><span>分组</span><div>' + groups + '</div></label>',
    '<label class="field"><span>摘要 / 笔记</span><textarea id="ef_note" class="inp area short">' + esc(it.note || it.abstract || '') + '</textarea></label>',
    '<div class="row-end"><button class="btn primary" id="ef_save">保存</button></div>'
  ].join(''));
  $('ef_save').onclick = () => {
    it.title = $('ef_title').value.trim() || it.title;
    it.authors = $('ef_authors').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    it.year = $('ef_year').value.trim(); it.journal = $('ef_journal').value.trim();
    it.doi = PD.normDOI($('ef_doi').value); it.ut = $('ef_ut').value.trim();
    it.volume = $('ef_volume').value.trim(); it.issue = $('ef_issue').value.trim(); it.pages = $('ef_pages').value.trim();
    it.tags = $('ef_tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    it.groups = Array.from(document.querySelectorAll('.eg:checked')).map(x => x.value);
    it.note = $('ef_note').value.trim();
    PD.save(); closeModal(); renderAll(); PD.toast('已保存');
  };
}

/* ---------- 06 共享 ---------- */
function updateSelects() {
  const groups = PD.state.groups;
  const opts = '<option value="">全部分组</option>' + groups.map(g => '<option value="' + esc(g) + '">' + esc(g) + '</option>').join('');
  $('filterGroup').innerHTML = opts;
  $('shareGroup').innerHTML = '<option value="__all">全部文献</option>' + groups.map(g => '<option value="' + esc(g) + '">' + esc(g) + '</option>').join('');
  const tags = Array.from(new Set(lib().flatMap(x => x.tags || [])));
  $('filterTag').innerHTML = '<option value="">全部标签</option>' + tags.map(t => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('');
  $('matchFromLib').innerHTML = '<option value="">或从库中选一篇自动填入</option>' + lib().map(x => '<option value="' + esc(x.id) + '">' + esc((x.title || '').slice(0, 70)) + '</option>').join('');
}
async function createShare() {
  const name = $('shareName').value.trim() || '共享文献组';
  const g = $('shareGroup').value, note = $('shareNote').value.trim();
  const items = (g === '__all' ? lib() : lib().filter(x => (x.groups || []).includes(g))).map(x => ({
    title: x.title, authors: x.authors, year: x.year, journal: x.journal, doi: x.doi,
    citedBy: x.citedBy, ut: x.ut, url: x.url, tags: x.tags, abstract: (x.abstract || '').slice(0, 500)
  }));
  if (!items.length) { PD.toast('该范围没有文献'); return; }
  if (PD.serverMode) {
    try {
      const r = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, note, items }) });
      const d = await r.json();
      if (d.ok) { PD.state.shares = PD.state.shares || []; PD.state.shares.unshift({ id: d.id, name, count: items.length, at: Date.now() }); PD.save(); renderShareList(); PD.toast('共享链接已生成，可转发给任意人数'); }
    } catch (e) { PD.toast('生成失败：' + e.message); }
  } else {
    PD.download('paperdesk-share.html', PD.exportHTML(items, name, note), 'text/html');
    PD.state.shares = PD.state.shares || []; PD.state.shares.unshift({ id: 'local', name, count: items.length, at: Date.now() });
    PD.save(); renderShareList(); PD.toast('已下载自包含 HTML 快照，转发该文件即可');
  }
}
async function renderShareList() {
  let list = PD.state.shares || [];
  if (PD.serverMode) {
    try { const d = await (await fetch('/api/shares')).json(); list = Object.values(d || {}).map(x => ({ id: x.id, name: x.name, count: (x.items || []).length, at: (x.createdAt || 0) * 1000 })).reverse(); } catch (e) { }
  }
  $('shareList').innerHTML = list.length ? list.map(s =>
    '<div class="li"><div class="li-main"><div class="li-title">' + esc(s.name) + '</div><div class="muted">' + s.count + ' 篇 · ' + new Date(s.at).toLocaleString('zh-CN') + '</div>' +
    (s.id !== 'local' ? '<div class="muted small" style="word-break:break-all">' + esc(location.origin + '/share/' + s.id) + '</div>' : '<div class="muted small">已导出为本地 HTML 文件</div>') + '</div>' +
    (s.id !== 'local' ? '<a class="btn small" target="_blank" href="/share/' + esc(s.id) + '">打开</a><button class="btn small" data-act="copylink" data-id="' + esc(s.id) + '">复制链接</button>' : '') + '</div>'
  ).join('') : '<div class="empty">还没有共享快照</div>';
  $('shareHint').textContent = PD.serverMode
    ? '当前为服务端模式：生成的是真实在线只读链接（' + location.origin + '/share/…），同一网络的设备可直接打开，转发人数不限。'
    : (PD.staticHost
      ? '当前为 GitHub Pages 静态托管：点「生成共享链接」会下载一个自包含 HTML 快照，转发给任意人数都能直接打开；在线实时链接需运行本地 serve.py。'
      : '当前为本地文件模式：会下载一个自包含 HTML 快照，用邮件/微信发给任意人数都能直接打开，无需服务器。启动 serve.py 后可生成在线链接。');
}

/* ---------- 07 边写边引 ---------- */
function citeOrder() { PD.state.settings.citeOrder = PD.state.settings.citeOrder || []; return PD.state.settings.citeOrder; }
function citeKey(it) {
  const o = citeOrder();
  if (!o.includes(it.id)) { o.push(it.id); PD.save(); }
  return o.indexOf(it.id) + 1;
}
function usedInText(text) {
  const re = /\[\[PD:(\d+)\]\]/g, seen = [], order = []; let m;
  while ((m = re.exec(text))) {
    const k = Number(m[1]);
    if (!seen.includes(k)) { seen.push(k); const it = find(citeOrder()[k - 1]); if (it) order.push({ k, it }); }
  }
  return order;
}
function renderPicker() {
  const q = $('citePickerQ').value.trim().toLowerCase();
  const arr = lib().filter(x => !q || [x.title, (x.authors || []).join(' '), x.journal, x.year].join(' ').toLowerCase().includes(q));
  $('citePicker').innerHTML = arr.length ? arr.map(it =>
    '<div class="picker-item" data-act="insert" data-id="' + esc(it.id) + '" title="点击插入引用"><div class="t">' + esc((it.title || '').slice(0, 70)) + '</div>' +
    '<div class="m">' + esc(((it.authors || [])[0] || '—') + ' · ' + (it.year || '—')) + ' · 标记 ' + (citeOrder().indexOf(it.id) + 1 || '—') + '</div></div>'
  ).join('') : '<div class="empty">无匹配文献</div>';
}
function insertCite(id) {
  const it = find(id); if (!it) return;
  const k = citeKey(it), mark = '[[PD:' + k + ']]';
  const ta = $('manuscript'), s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + mark + ta.value.slice(e);
  ta.focus(); ta.selectionStart = ta.selectionEnd = s + mark.length;
  PD.state.manuscript = ta.value; PD.save(); renderPreview(); renderPicker();
}
function renderPreview() {
  const text = $('manuscript').value || '';
  const style = $('citeStyle').value, mode = $('citeMode').value;
  const order = usedInText(text);
  const showNum = mode === 'numbered';
  const nMap = new Map(order.map((o, i) => [o.k, i + 1]));
  let html = esc(text).replace(/\[\[PD:(\d+)\]\]/g, (m, k) => {
    const o = order.find(x => x.k === Number(k));
    if (!o) return '<span class="cite-mark">[?]</span>';
    return '<span class="cite-mark">' + esc(PD.citeLabel(o.it, mode, nMap.get(Number(k)))) + '</span>';
  }).replace(/^# (.+)$/gm, '<h2>$1</h2>').replace(/\n/g, '<br>');
  $('preview').innerHTML = html || '<span class="muted">在上方写作，点左侧文献即可插入引用标记。</span>';
  let list = order.map(o => o.it);
  if (mode === 'author-year' || style === 'apa' || style === 'mla' || style === 'chicago') list = list.slice().sort((a, b) => ((a.authors || [])[0] || '').localeCompare((b.authors || [])[0] || ''));
  $('bibliography').innerHTML = list.length ? list.map((it, i) =>
    '<div class="b">' + (showNum ? '<span class="idx">[' + (i + 1) + ']</span>' : '') + '<span>' + PD.formatRef(it, style, i + 1) + '</span></div>'
  ).join('') : '<div class="empty">尚未插入引用</div>';
  $('bibCount').textContent = list.length + ' 条';
}
function writeExport(kind) {
  const text = $('manuscript').value || '', style = $('citeStyle').value, mode = $('citeMode').value;
  const order = usedInText(text);
  const nMap = new Map(order.map((o, i) => [o.k, i + 1]));
  const label = k => mode === 'author-year' ? PD.citeLabel(order.find(x => x.k === Number(k)).it, 'author-year') : '[' + nMap.get(Number(k)) + ']';
  const body = text.replace(/\[\[PD:(\d+)\]\]/g, (m, k) => order.some(x => x.k === Number(k)) ? label(k) : '[?]');
  const refs = order.map((o, i) => PD.formatRef(o.it, style, i + 1).replace(/<[^>]+>/g, ''));
  const md = body + '\n\n## 参考文献\n\n' + refs.map((r, i) => (mode === 'numbered' ? '[' + (i + 1) + '] ' : '') + r).join('\n\n') + '\n';
  if (kind === 'md') { PD.download('manuscript.md', md, 'text/markdown'); PD.toast('已导出 Markdown'); return; }
  const html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>Manuscript</title><style>body{font-family:"Times New Roman","Songti SC",serif;max-width:760px;margin:50px auto;line-height:2;font-size:15px;color:#111}h1{font-size:22px;text-align:center}h2{font-size:17px;margin-top:26px}p{text-indent:2em}ol{line-height:1.7;font-size:13px}</style></head><body>' +
    '<h1>论文正文</h1>' + body.split(/\n+/).map(p => '<p>' + esc(p) + '</p>').join('') +
    '<h2>参考文献</h2><ol>' + refs.map(r => '<li>' + esc(r) + '</li>').join('') + '</ol></body></html>';
  if (kind === 'html') { PD.download('manuscript.html', html, 'text/html'); PD.toast('已导出 HTML'); }
  if (kind === 'doc') { PD.download('manuscript.doc', html, 'application/msword'); PD.toast('已导出 Word 可打开的 .doc'); }
}

/* ---------- 08 投稿模板 ---------- */
function initJournals() {
  $('journalSelect').innerHTML = PD.JOURNALS.map((j, i) => '<option value="' + i + '">' + esc(j.name) + ' · ' + esc(j.field) + '</option>').join('');
  const idx = PD.JOURNALS.findIndex(j => j.name === PD.state.settings.journal);
  if (idx >= 0) $('journalSelect').value = idx;
}
function currentJournal() {
  const custom = $('customJournal').value.trim();
  let j = PD.JOURNALS[Number($('journalSelect').value)] || PD.JOURNALS[0];
  if (custom) j = Object.assign({}, j, { name: custom, field: '自定义' });
  return j;
}
function genTemplate(title) {
  const j = currentJournal(); templateJournal = j;
  PD.state.settings.journal = j.name;
  templateText = PD.template(j, title || $('matchTitle').value.trim());
  $('templatePreview').value = templateText;
  $('templateMeta').innerHTML = [
    ['目标期刊', j.name, j.field], ['篇幅', j.words.split('（')[0], '按官方作者指南'],
    ['摘要', j.abs.slice(0, 12), j.abs], ['引文格式', j.style.toUpperCase(), '可一键套用到写作区']
  ].map(x => '<div class="stat"><div class="k">' + x[0] + '</div><div class="v" style="font-size:16px">' + esc(x[1]) + '</div><div class="s">' + esc(x[2]) + '</div></div>').join('');
  PD.save(); PD.toast('稿件骨架已生成');
}
function applyStyle() {
  const j = currentJournal();
  PD.state.settings.style = j.style;
  $('citeStyle').value = j.style;
  PD.save(); renderPreview();
  PD.toast('写作区引文样式已切换为 ' + j.style.toUpperCase());
}

/* ---------- 09 期刊匹配 ---------- */
function scoreSources(sources, kws, abstract, libJournals) {
  const hay = (abstract || '').toLowerCase();
  return sources.map(s => {
    const name = (s.display_name || '').toLowerCase();
    const topics = (s.topics || []).map(t => (t.display_name || '').toLowerCase());
    const st = (s.summary_stats || {});
    const hitName = kws.filter(k => k.length > 1 && name.includes(k.toLowerCase()));
    const hitTopic = kws.filter(k => {
      const kw = k.toLowerCase();
      return topics.some(t => { const head = t.split(' ')[0] || ''; return kw.length > 1 && (t.includes(kw) || (head.length > 2 && kw.includes(head))); });
    });
    const overlapped = libJournals.filter(j => j && (name.includes(j.toLowerCase().slice(0, 12)) || j.toLowerCase().includes(name.slice(0, 12))));
    let score = 0, reasons = [];
    if (hitName.length) { score += Math.min(32, hitName.length * 14); reasons.push('刊名/主题词命中：' + hitName.slice(0, 3).join('、')); }
    if (hitTopic.length) { score += Math.min(30, hitTopic.length * 8); reasons.push('期刊主题匹配：' + hitTopic.slice(0, 3).join('、')); }
    if (overlapped.length) { score += 16; reasons.push('你已有 ' + overlapped.length + ' 篇参考文献发表于同类期刊'); }
    const h = PD.num(st.h_index), cited = PD.num(st['2yr_mean_citedness']), works = PD.num(s.works_count);
    score += Math.min(14, Math.log10(h + 1) * 4.5);
    score += Math.min(10, Math.log10(cited + 1) * 6);
    if (works < 100) score -= 12;
    if (s.type && s.type !== 'journal') score -= 8;
    if (!reasons.length) reasons.push('按主题检索相关度与影响力指标入选');
    return { s, score: Math.max(8, Math.min(99, Math.round(score + 18))), reasons, h, cited, works };
  }).sort((a, b) => b.score - a.score).slice(0, 10);
}
async function matchJournals() {
  const title = $('matchTitle').value.trim(), abs = $('matchAbstract').value.trim();
  if (!title && !abs) { PD.toast('填写标题或摘要'); return; }
  const kws = PD.keywords(title + ' ' + title + ' ' + abs, 14);
  if (!kws.length) { PD.toast('没能提取出主题词，补充一点摘要'); return; }
  $('matchResults').innerHTML = '<div class="empty">正在检索 OpenAlex 期刊库并打分…</div>';
  const queries = [kws.slice(0, 3).join(' '), kws.slice(0, 6).join(' '), title.slice(0, 60)];
  const libJournals = Array.from(new Set(lib().map(x => x.journal).filter(Boolean)));
  if (libJournals.length) queries.push(libJournals[0]);
  const sources = await PD.sources(queries);
  matchList = scoreSources(sources, kws, title + ' ' + abs, libJournals);
  renderMatch();
}
function renderMatch() {
  $('matchResults').innerHTML = matchList.length ? matchList.map((m, i) => {
    const s = m.s;
    return '<div class="match-card"><div class="score">' + m.score + '</div><div style="flex:1;min-width:0">' +
      '<div class="li-title">' + (i + 1) + '. ' + esc(s.display_name) + '</div>' +
      '<div class="match-meta">' +
      '<span class="tag brand">h-index ' + m.h + '</span><span class="tag">近两年篇均被引 ' + m.cited.toFixed(1) + '</span>' +
      '<span class="tag">收录 ' + m.works.toLocaleString() + ' 篇</span>' + (s.issn_l ? '<span class="tag">ISSN ' + esc(s.issn_l) + '</span>' : '') +
      (s.is_oa ? '<span class="tag green">开放获取</span>' : '') + (s.apc_usd ? '<span class="tag amber">APC $' + s.apc_usd + '</span>' : '') + '</div>' +
      '<div class="reason">匹配依据：' + esc(m.reasons.join('；')) + (s.host_organization_name ? ' · 出版方 ' + esc(s.host_organization_name) : '') + '</div>' +
      '<div class="btn-row" style="margin-top:9px">' +
      '<button class="btn small primary" data-act="use-journal" data-i="' + i + '">套用该刊模板</button>' +
      (s.homepage_url ? '<a class="btn small" target="_blank" href="' + esc(s.homepage_url) + '">期刊官网 ↗</a>' : '') +
      '<a class="btn small" target="_blank" href="https://mjl.clarivate.com/search-results?issn=' + esc(s.issn_l || '') + '">WoS 期刊档案 ↗</a>' +
      '<a class="btn small" target="_blank" href="https://jane.biosemantics.org/">JANE 校验 ↗</a></div></div></div>';
  }).join('') + '<div class="howto">官方选刊工具：<a target="_blank" href="https://mjl.clarivate.com/">Clarivate Manuscript Matcher / Master Journal List</a>（需 WoS 订阅） · <a target="_blank" href="https://journalfinder.elsevier.com/">Elsevier Journal Finder</a> · <a target="_blank" href="https://journalsuggester.springer.com/">Springer Journal Suggester</a> · <a target="_blank" href="https://jane.biosemantics.org/">JANE</a>（免费）</div>'
    : '<div class="empty">没有检索到匹配期刊，换个标题或补充摘要再试。</div>';
}

/* ---------- 渲染总入口 ---------- */
function renderAll() {
  updateHeader();
  $('manuscript').value = PD.state.manuscript || '';
  $('citeStyle').value = PD.state.settings.style || 'gbt7714';
  $('citeMode').value = PD.state.settings.citeMode || 'numbered';
  renderSync(); renderWos(); renderReport(); renderLibrary(); renderCharts();
  updateSelects(); renderShareList(); renderPicker(); renderPreview();
}

/* ---------- 事件绑定 ---------- */
$('nav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); });
$('btnQuickSave').onclick = () => { PD.saveNow(); PD.toast('已保存'); };
$('modalClose').onclick = closeModal;
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
$('btnSearch').onclick = () => doSearch(1);
$('q').onkeydown = e => { if (e.key === 'Enter') doSearch(1); };
$('btnPrev').onclick = () => { if (page > 1) doSearch(page - 1); };
$('btnNext').onclick = () => doSearch(page + 1);
$('btnAddAll').onclick = () => { if (!PD.searchResults.length) return; PD.addItems(PD.searchResults); renderAll(); };
$('btnChoose').onclick = () => $('fileInput').click();
$('fileInput').onchange = e => handleFiles(e.target.files);
const dz = $('dropZone');
dz.onclick = () => $('fileInput').click();
['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
$('btnParsePaste').onclick = async () => {
  const text = $('pasteBox').value.trim(); if (!text) { PD.toast('先粘贴内容'); return; }
  const r = PD.parseAny(text, 'paste.txt');
  let items = r.items || [];
  if (r.dois && r.dois.length) { PD.toast('正在解析 DOI…'); items = items.concat(await PD.lookupDOIs(r.dois)); }
  if (!items.length) {
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 30);
    if (lines.length) { PD.toast('按题名逐条检索 ' + lines.length + ' 条…'); for (const q of lines) { try { const rr = await PD.search({ q, source: 'openalex', page: 1 }); if (rr.items[0]) items.push(rr.items[0]); } catch (e) { } } }
  }
  if (!items.length) { PD.toast('没有解析出文献'); return; }
  PD.addItems(items); $('pasteBox').value = ''; renderAll(); enrichImported(items);
};
$('btnImportState').onclick = () => $('stateFile').click();
$('stateFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { restoreState(JSON.parse((await f.text()).replace(/^\ufeff/, ''))); } catch (err) { PD.toast('备份文件解析失败：' + err.message); } };
$('btnRefreshCites').onclick = refreshCites;
$('btnExportReport').onclick = () => {
  const r = reportData();
  const rows = [['#', 'Title', 'Authors', 'Year', 'Journal', 'DOI', 'CitedBy', 'FWCI', 'WoS_UT']].concat(
    r.L.map((it, i) => [i + 1, it.title, (it.authors || []).join('; '), it.year, it.journal, it.doi, it.citedBy, it.fwci, it.ut]));
  PD.download('citation-report.csv', rows.map(row => row.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n'), 'text/csv');
  PD.toast('引文报告已导出');
};
$('btnPrintReport').onclick = () => window.print();
$('btnAddRelated').onclick = () => { if (PD.relatedItems.length) { PD.addItems(PD.relatedItems); renderAll(); } };
['filterQ', 'filterGroup', 'filterTag', 'filterSort'].forEach(id => {
  $(id).addEventListener(id === 'filterQ' ? 'input' : 'change', renderLibrary);
});
$('btnClearFilters').onclick = () => { $('filterQ').value = ''; $('filterGroup').value = ''; $('filterTag').value = ''; renderLibrary(); };
$('btnNewGroup').onclick = () => ask('新建分组名称', '', v => {
  if (!v) return;
  if (PD.state.groups.includes(v)) { PD.toast('分组已存在'); return; }
  PD.state.groups.push(v); PD.save(); updateSelects(); renderLibrary(); PD.toast('分组已创建');
});
$('btnGroupSelected').onclick = () => {
  if (!sel.size) { PD.toast('先勾选文献'); return; }
  const gs = PD.state.groups;
  modal('把选中项加入分组', '<p class="para">已选 ' + sel.size + ' 篇。选择已有分组，或输入新名称。</p>' +
    '<label class="field"><span>已有分组</span><select id="pickGroup" class="inp"><option value="">— 不选 —</option>' + gs.map(g => '<option value="' + esc(g) + '">' + esc(g) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span>或新建分组</span><input id="newGroup" class="inp" placeholder="新分组名"></label>' +
    '<div class="row-end"><button class="btn primary" id="doGroup">确定</button></div>');
  $('doGroup').onclick = () => {
    const g = $('newGroup').value.trim() || $('pickGroup').value;
    if (!g) { closeModal(); return; }
    if (!PD.state.groups.includes(g)) PD.state.groups.push(g);
    lib().forEach(it => { if (sel.has(it.id)) { it.groups = it.groups || []; if (!it.groups.includes(g)) it.groups.push(g); } });
    PD.save(); closeModal(); renderAll(); PD.toast('已加入分组「' + g + '」');
  };
};
$('btnTagSelected').onclick = () => {
  if (!sel.size) { PD.toast('先勾选文献'); return; }
  ask('批量添加标签', '', v => {
    if (!v) return;
    lib().forEach(it => { if (sel.has(it.id)) { it.tags = it.tags || []; if (!it.tags.includes(v)) it.tags.push(v); } });
    PD.save(); renderAll(); PD.toast('标签已添加');
  });
};
$('btnStarSelected').onclick = () => {
  if (!sel.size) { PD.toast('先勾选文献'); return; }
  lib().forEach(it => { if (sel.has(it.id)) it.starred = !it.starred; });
  PD.save(); renderLibrary();
};
$('btnDeleteSelected').onclick = () => {
  if (!sel.size) { PD.toast('先勾选文献'); return; }
  confirmBox('确定从库中移除选中的 ' + sel.size + ' 篇文献？（导出备份可恢复）', () => {
    PD.state.library = lib().filter(x => !sel.has(x.id)); sel.clear(); PD.save(); renderAll(); PD.toast('已移除');
  });
};
$('btnDedup').onclick = () => {
  const seen = new Map(); let n = 0;
  PD.state.library = lib().filter(it => { const k = PD.keyOf(it); if (seen.has(k)) { n++; return false; } seen.set(k, 1); return true; });
  PD.save(); renderAll(); PD.toast(n ? '已合并 ' + n + ' 条重复文献' : '没有发现重复');
};
$('btnShare').onclick = createShare;
$('manuscript').addEventListener('input', e => { PD.state.manuscript = e.target.value; PD.save(); renderPreview(); });
$('citeStyle').onchange = e => { PD.state.settings.style = e.target.value; PD.save(); renderPreview(); PD.toast('全文引文已按新格式重排'); };
$('citeMode').onchange = e => { PD.state.settings.citeMode = e.target.value; PD.save(); renderPreview(); };
$('citePickerQ').addEventListener('input', renderPicker);
$('btnCopyBib').onclick = () => {
  const t = $('bibliography').innerText || '';
  if (t) PD.copy(t); else PD.toast('还没有参考文献');
};
$('btnGenTemplate').onclick = () => genTemplate();
$('btnApplyStyle').onclick = applyStyle;
$('templatePreview').addEventListener('input', e => { templateText = e.target.value; });
$('btnMatch').onclick = matchJournals;
$('matchFromLib').onchange = e => {
  const it = find(e.target.value); if (!it) return;
  $('matchTitle').value = it.title || ''; $('matchAbstract').value = it.abstract || (it.concepts || []).join(' ');
  PD.toast('已填入该文献的题名与摘要');
};

/* 动态元素统一委托 */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'chip') { $('q').value = b.dataset.q; doSearch(1); }
  else if (act === 'demo') loadDemo();
  else if (act === 'add-one') { const it = PD.searchResults.find(x => x.id === id); if (it) { PD.addItems([it]); renderAll(); } }
  else if (act === 'add-related') { const it = PD.relatedItems.find(x => x.id === id); if (it) { PD.addItems([it]); renderAll(); } }
  else if (act === 'related') showRelated(id);
  else if (act === 'edit') editItem(id);
  else if (act === 'insert') insertCite(id);
  else if (act === 'sel') { b.checked ? sel.add(id) : sel.delete(id); }
  else if (act === 'copylink') PD.copy(location.origin + '/share/' + id);
  else if (act === 'use-journal') {
    const m = matchList[Number(b.dataset.i)]; if (!m) return;
    const name = m.s.display_name;
    const idx = PD.JOURNALS.findIndex(j => name.toLowerCase().includes(j.name.toLowerCase()) || j.name.toLowerCase().includes(name.toLowerCase().slice(0, 10)));
    $('customJournal').value = idx >= 0 ? '' : name;
    if (idx >= 0) $('journalSelect').value = idx;
    go('v8'); genTemplate($('matchTitle').value.trim()); PD.toast('已切换到「' + name + '」模板');
  }
  else if (act === 'wos') { /* 链接已由 a 标签处理 */ }
});
document.querySelectorAll('[data-export]').forEach(b => b.onclick = () => doExport(b.dataset.export));
document.querySelectorAll('[data-writeexport]').forEach(b => b.onclick = () => writeExport(b.dataset.writeexport));
document.querySelectorAll('[data-tplexport]').forEach(b => b.onclick = () => {
  const t = $('templatePreview').value || templateText;
  if (!t) { PD.toast('先生成模板'); return; }
  if (b.dataset.tplexport === 'md') PD.download('manuscript-template.md', t, 'text/markdown');
  else PD.download('manuscript-template.doc', '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>body{font-family:"Times New Roman","Songti SC",serif;max-width:760px;margin:50px auto;line-height:1.9;font-size:15px}h1{font-size:21px}h2{font-size:16px;margin-top:22px}</style></head><body>' + t.split('\n').map(l => l.startsWith('# ') ? '<h1>' + esc(l.slice(2)) + '</h1>' : l.startsWith('## ') ? '<h2>' + esc(l.slice(3)) + '</h2>' : l.startsWith('> ') ? '<p style="color:#555;font-size:13px">' + esc(l.slice(2)) + '</p>' : l.startsWith('<!--') ? '' : '<p>' + esc(l) + '</p>').join('') + '</body></html>', 'application/msword');
  PD.toast('模板已导出');
});

renderChips(); initJournals(); genTemplate('');
renderAll(); go('v1');
})();
