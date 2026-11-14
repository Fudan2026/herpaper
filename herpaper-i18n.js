/* HerPaper display-layer i18n: Chinese source -> English display.
 *
 * The workbench's source of truth is Chinese (apps/her-paper). When the SuPro
 * platform is in English mode, the shell sets window.PD_SUPRO_LOCALE = "en"
 * before loading scripts; this file then sweeps rendered DOM text through a
 * zh->en dictionary (exact match) plus regex patterns (parameterized strings
 * like counters and toast templates). In zh mode this script is a no-op, so
 * standalone/local usage is untouched.
 *
 * Loaded AFTER cloud-sync.js and BEFORE app.js, so the MutationObserver is in
 * place before app.js renders its views. Static markup injected from
 * index.html is covered by the initial sweep.
 *
 * User content is never translated: <textarea>, the manuscript editor, the
 * live preview and the paste boxes are excluded (Chinese prose there is the
 * user's own text, not UI chrome).
 */
(function () {
  'use strict';

  /* Locale resolution:
   *  - SuPro embed: the platform sets window.PD_SUPRO_LOCALE on every mount —
   *    it always wins and the in-app toggle stays hidden.
   *  - Standalone (GitHub Pages / local server / file://): the user's own
   *    choice persists in localStorage["herpaper.locale"] (default zh). */
  var EMBEDDED = typeof window.PD_SUPRO_LOCALE === 'string';
  function storedLocale() {
    try { return localStorage.getItem('herpaper.locale') || 'zh'; } catch (e) { return 'zh'; }
  }
  var locale = EMBEDDED ? window.PD_SUPRO_LOCALE : storedLocale();
  try {
    if (document.documentElement) document.documentElement.lang = (locale === 'en' ? 'en' : 'zh-CN');
  } catch (e) { /* headless contexts */ }

  var toggle = document.getElementById('btnLocale');
  if (toggle) {
    if (EMBEDDED) {
      toggle.style.display = 'none'; // the platform locale toggle owns this
    } else {
      toggle.textContent = locale === 'en' ? '中' : 'EN';
      toggle.title = locale === 'en' ? '切换到中文' : 'Switch to English';
      toggle.setAttribute('aria-label', toggle.title);
      toggle.addEventListener('click', function () {
        try { localStorage.setItem('herpaper.locale', locale === 'en' ? 'zh' : 'en'); } catch (e) { /* ignore */ }
        location.reload();
      });
    }
  }

  if (locale !== 'en') return;
  if (!document.body) return;

  /* zh -> en, exact match on the trimmed text node / attribute value. */
  var DICT = {
    // --- sidebar / shell ---
    "检索建库": "Search & Build",
    "Web of Science / 开放库": "Web of Science / Open indexes",
    "跨平台同步": "Cross-platform Sync",
    "SuPro 云端同步": "SuPro cloud sync",
    "默认仅本机 · 登录 SuPro 后可自选上云": "Local by default · opt in to cloud after signing in",
    "未开启 · 仅本机保存": "Off · local only",
    "开启云端同步": "Enable cloud sync",
    "关闭云端同步": "Disable cloud sync",
    "已开启 · 云端自动同步": "On · automatic cloud sync",
    "已开启 · 请先登录 SuPro": "On · sign in to SuPro first",
    "开启后，本机文献库将通过你的 SuPro 账号自动同步到云端（/api/herpaper/library，RLS 按账号隔离），换设备打开即同一库。关闭时只存本机，不消耗任何云存储。": "Once enabled, your library syncs through your SuPro account (/api/herpaper/library, isolated per account by RLS) — the same library on every device. When off, everything stays local and uses zero cloud storage.",
    "本地模式 · 云同步未开启": "Local mode · cloud sync off",
    "云同步未开启 · 仅本机保存": "Cloud sync off · local only",
    "本地模式 · 未登录 SuPro": "Local mode · not signed in to SuPro",
    "arXiv 金融·经济 (q-fin)": "arXiv Finance & Economics (q-fin)",
    "设备系统日期 · 大赛截图合规凭据": "Device date · contest screenshot proof",
    "对比矩阵": "Compare matrix",
    "导出反馈草稿": "Export feedback draft",
    "先在检索建库收几篇文献": "Collect papers in Search & Build first",
    "摘要摘录": "Abstract excerpt",
    "复制 Markdown": "Copy Markdown",
    "反馈草稿已导出": "Feedback draft exported",
    "本地 · 云盘 · 多端": "Local · Cloud drive · Multi-device",
    "全记录与相关文献": "Full Records & Related",
    "WoS 深链 / 相关记录": "WoS deep links / Related records",
    "引文报告": "Citation Report",
    "被引 · h 指数 · 趋势": "Citations · h-index · Trends",
    "管理与分析": "Manage & Analyze",
    "分组 · 去重 · 图表": "Groups · Dedup · Charts",
    "共享协同": "Share & Collaborate",
    "只读快照 · 分组包": "Read-only snapshots · Group packs",
    "边写边引": "Write & Cite",
    "一键切换引文格式": "Switch citation style in one click",
    "投稿模板": "Submission Templates",
    "期刊稿件骨架": "Journal manuscript skeleton",
    "期刊匹配": "Journal Matcher",
    "文稿 → 目标期刊": "Manuscript → target journal",
    "初始化中…": "Initializing…",
    "数据仅存本机 · 无需账号": "Data stays local · no account needed",
    "未登录 SuPro · 仅本机保存": "Not signed in to SuPro · local only",
    "本地模式 · 未登录": "Local mode · not signed in",
    "登录已过期 · 请重登": "Session expired · sign in again",
    "云端拉取失败 · 本地模式": "Cloud pull failed · local mode",
    "云端保存失败 · 已留本地": "Cloud save failed · kept locally",
    "检测存储中": "Detecting storage…",
    "篇文献": "items",
    "讲座 / 介绍": "Intro / Slides",
    "立即保存": "Save now",

    // --- view 01: search & build ---
    "把文献收进来": "Bring the papers in",
    "联网检索 OpenAlex / Europe PMC，或把 Web of Science、EndNote、Zotero 导出的文件直接拖进来。入库后其余八项自动全部可用。": "Search OpenAlex / Europe PMC online, or drag in files exported from Web of Science, EndNote or Zotero. Once items are in, the other eight views work automatically.",
    "联网检索": "Search online",
    "开放学术索引 · 实时元数据与被引数": "Open scholarly indexes · live metadata and citation counts",
    "DOI 精确": "DOI exact",
    "全部类型": "All types",
    "期刊论文": "Journal article",
    "综述": "Review",
    "预印本": "Preprint",
    "书章节": "Book chapter",
    "年份": "Year",
    "至": "to",
    "仅开放获取": "Open access only",
    "检索": "Search",
    "输入关键词开始检索，或从下方导入 WoS 导出文件。": "Type keywords to search, or import a WoS export below.",
    "上一页": "Prev",
    "下一页": "Next",
    "全部加入库": "Add all to library",
    "导入 WoS / EndNote / Zotero": "Import WoS / EndNote / Zotero",
    "WoS 导出文件一键入库": "One-click import of WoS exports",
    "拖入": "Drop",
    "文件": "files",
    "或": "or",
    "选择文件": "choose files",
    "（可多选）": "(multiple allowed)",
    "Web of Science → 检索结果 →": "Web of Science → results →",
    "导出": "Export",
    "→ 选": "→ pick",
    "RIS / 其他参考文献软件": "RIS / other reference software",
    "→ 保存后拖进来；文件里的": "→ save and drop the file in; its",
    "入藏号会被保留，用于一键跳回全记录页。": "accession number is kept for one-click jumps to the full-record page.",
    "粘贴导入": "Paste import",
    "DOI / PMID / 题名列表 / WoS 文本": "DOI / PMID / title list / WoS text",
    "解析并加入库": "Parse and add",
    "DOI 会自动向 OpenAlex 补全作者、期刊、摘要、被引数；离线导入的条目也可用「引文报告」里的批量刷新补全。": "DOIs are enriched with authors, journal, abstract and citation counts via OpenAlex; offline items can be enriched later via the batch refresh in the Citation Report.",

    // --- view 02: sync ---
    "本地自动保存是默认；通过本服务访问时改为服务端持久化，同一网络内其他设备打开同一地址即可读到同一个库。": "Local autosave is the default; when accessed through the service, storage moves server-side and any device on the same network opening the same address reads the same library.",
    "Zotero 增量同步": "Zotero incremental sync",
    "Web API v3 · Local API 23119 · CSL-JSON 内部规范": "Web API v3 · Local API 23119 · CSL-JSON internal format",
    "Local API · 本机 23119": "Local API · localhost 23119",
    "保存配置": "Save config",
    "增量拉取": "Incremental pull",
    "推送改动": "Push changes",
    "授权写入": "Authorize writes",
    "用 Zotero citeproc 渲染": "Render with Zotero citeproc",
    "导出 CSL-JSON": "Export CSL-JSON",
    "刷新状态": "Refresh status",
    "正在检测本机 Zotero Local API…": "Detecting the local Zotero Local API…",
    "整库导出 / 恢复": "Full export / restore",
    "所有格式均可再导入，或与 Zotero / EndNote 互通": "All formats re-importable; interoperates with Zotero / EndNote",
    "完整备份 .json": "Full backup .json",
    "CSV 表格": "CSV table",
    "自包含 HTML 快照": "Self-contained HTML snapshot",
    "恢复 .json 备份": "Restore .json backup",
    "把导出的": "Put the exported",
    "放进 iCloud Drive / OneDrive（本机已装），在另一台设备打开本工作台后「恢复备份」即可。若通过": "into iCloud Drive / OneDrive (installed on this machine), open this workbench on another device and click Restore backup. If accessed via",
    "访问，库自动写入": ", the library auto-writes to",
    "，同一地址即同一份数据。": " — same address, same data.",
    "与 Zotero 互通": "Interop with Zotero",
    "本机已安装 Zotero 10.0.8": "Zotero 10.0.8 installed on this machine",
    "导出 RIS 后在 Zotero 里": "Export RIS, then in Zotero",
    "文件 → 导入": "File → Import",
    "；Zotero 的 Group Library 支持多人实时协作与云同步，可作为「边写边引」的桌面插件通道（Word / LibreOffice / WPS）。本工作台负责 WoS 深链、引文分析、期刊匹配与格式化输出，两者用 RIS / BibTeX 双向衔接，互不锁定。": "; Zotero's Group Library supports real-time collaboration and cloud sync as the desktop-plugin channel for Write & Cite (Word / LibreOffice / WPS). This workbench handles WoS deep links, citation analysis, journal matching and formatted output; the two connect through RIS / BibTeX without lock-in.",

    // --- view 03: full record ---
    "全记录页与相关文献": "Full record & related records",
    "每条文献生成 Web of Science 全记录深链（需机构订阅），并同时给出开放替代品；「相关记录」由 OpenAlex 的 related_works 实时拉取。": "Each item gets a Web of Science full-record deep link (institutional subscription needed) plus open alternatives; Related records are pulled live from OpenAlex related_works.",
    "库内文献": "Items in library",
    "点击即可跳转或展开相关记录": "Click to jump or expand related records",
    "相关记录": "Related records",
    "引文链条": "Citation chain",
    "加入全部参考文献": "Add all references",
    "加入全部施引文献": "Add all citing works",
    "库是空的，先在「检索建库」收几篇文献。": "The library is empty — collect papers in Search & Build first.",
    "正在拉取 OpenAlex 相关记录…": "Fetching related records from OpenAlex…",
    "没有取到相关记录，可先在引文报告里刷新数据补全 OpenAlex ID。": "No related records fetched — refresh citation data first to fill in OpenAlex IDs.",
    "该条目没有 OpenAlex ID 或 DOI，无法展开引文链条": "This item has no OpenAlex ID or DOI; the citation chain cannot be expanded",
    "正在向 OpenAlex 拉取双向引文链条…": "Fetching the two-way citation chain from OpenAlex…",
    "注意：该文献在 OpenAlex 标记为已撤稿。": "Note: this item is flagged as retracted in OpenAlex.",
    "引文链条已展开": "Citation chain expanded",

    // --- view 04: citation report ---
    "批量刷新 OpenAlex 被引数据，生成可导出的影响力报告。WoS 引文报告需订阅，这里用开放引文索引做等价分析。": "Batch-refresh OpenAlex citation data and build an exportable impact report. The WoS citation report needs a subscription; this open citation index gives the equivalent analysis.",
    "报告范围：当前全部文献": "Report scope: all items",
    "数据来自 OpenAlex 与 Europe PMC": "Data from OpenAlex and Europe PMC",
    "刷新被引数据": "Refresh citation data",
    "导出报告 CSV": "Export report CSV",
    "打印 / 存 PDF": "Print / save PDF",
    "逐年被引分布": "Citations by year",
    "高被引 Top 10": "Top 10 cited",
    "期刊分布": "Journal distribution",
    "影响力细项": "Impact details",
    "当前分析范围": "Current analysis scope",
    "总被引": "Total citations",
    "篇均被引": "Citations per item",
    "总被引 ÷ 文献数": "Total citations ÷ items",
    "h 指数": "h-index",
    "基于本库被引分布": "Based on this library's citation distribution",
    "逐年被引次数（近 12 年）": "Citations per year (last 12 years)",
    "平均 FWCI": "Average FWCI",
    "领域归一化引用影响，>1 高于世界均值": "Field-normalized citation impact; >1 above world average",
    "前 10% 高被引": "Top 10% cited",
    "按 OpenAlex 引文百分位": "By OpenAlex citation percentile",
    "近两年被引": "Citations in last 2 years",
    "本年度与前一年合计": "This year plus previous year",
    "开放获取": "Open access",
    "可公开获取全文的条目": "Items with publicly available full text",
    "暂无数据": "No data",
    "库为空，先去检索建库": "Library is empty — collect papers first",
    "库是空的": "Library is empty",

    // --- view 05: manage & analyze ---
    "分组、标签、备注、去重、全文检索，并把库结构画成图，看出研究脉络。": "Groups, tags, notes, dedup, full-text search — plus charts of the library's structure to see the research thread.",
    "全部分组": "All groups",
    "全部标签": "All tags",
    "按加入时间": "By date added",
    "按年份": "By year",
    "按被引": "By citations",
    "按题名": "By title",
    "＋ 新建分组": "＋ New group",
    "选中项加入分组": "Add selected to group",
    "批量加标签": "Batch tag",
    "星标": "Star",
    "移除": "Remove",
    "去重": "Dedup",
    "清除筛选": "Clear filters",
    "年度发文": "Publications by year",
    "期刊 Top 10": "Top 10 journals",
    "研究主题 Top 10": "Top 10 topics",
    "高频作者 Top 10": "Top 10 authors",
    "按发表年份": "By publication year",
    "尚未建立分组": "No groups yet",
    "没有符合筛选条件的文献": "No items match the filters",
    "编辑文献": "Edit item",

    // --- view 06: share ---
    "共享文献图书馆": "Shared library",
    "生成只读分享快照，链接发给合作者即可查看，人数不受限；也可导出分组包供对方导入自己的库。": "Create read-only share snapshots — send the link to any number of collaborators; or export group packs they can import into their own library.",
    "创建共享快照": "Create share snapshot",
    "分享名称": "Share name",
    "选择范围": "Scope",
    "全部文献": "All items",
    "附言": "Note",
    "生成共享链接": "Create share link",
    "导出分组 RIS": "Export group RIS",
    "导出分组 BibTeX": "Export group BibTeX",
    "通过本地服务访问时可生成在线链接；直接双击打开文件时会自动下载一个自包含 HTML 快照，发给对方即可打开。": "Online links are available via the local server; opening the file directly downloads a self-contained HTML snapshot you can send to anyone.",
    "已创建的共享": "Created shares",
    "只读 · 可无限转发": "Read-only · forward freely",
    "实时协同的另一种做法": "Another route to real-time collaboration",
    "如果需要多人同时编辑、批注与权限管理，用本机 Zotero 建": "For simultaneous multi-user editing, annotations and permissions, create a",
    "（私有群组可邀请大量成员，支持云同步与 Word 插件）；本工作台的快照负责「一键发给 100 人看」，两者互补。所有分享链接都只指向你自己机器上的内容，不上传任何第三方服务器。": "in your local Zotero (private groups invite many members, with cloud sync and the Word plugin); the workbench snapshots cover \"send to 100 people at once\" — complementary. All share links point only at content on your own machine; nothing is uploaded to third-party servers.",
    "共享文献组": "Shared collection",
    "该范围没有文献": "No items in this scope",
    "共享链接已生成，可转发给任意人数": "Share link created — forward to anyone",
    "已下载自包含 HTML 快照，转发该文件即可": "Self-contained HTML snapshot downloaded — just forward the file",
    "复制链接": "Copy link",
    "还没有共享快照": "No share snapshots yet",
    "当前为服务端模式：生成的是真实在线只读链接（": "Server mode: generated links are real online read-only links (",
    "/share/…），同一网络的设备可直接打开，转发人数不限。": "/share/…), openable by any device on the same network, unlimited forwarding.",
    "当前为 GitHub Pages 静态托管：点「生成共享链接」会下载一个自包含 HTML 快照，转发给任意人数都能直接打开；在线实时链接需运行本地 serve.py。": "GitHub Pages static hosting: clicking Create share link downloads a self-contained HTML snapshot that anyone can open; live online links require running the local serve.py.",
    "当前为本地文件模式：会下载一个自包含 HTML 快照，用邮件/微信发给任意人数都能直接打开，无需服务器。启动 serve.py 后可生成在线链接。": "Local-file mode: a self-contained HTML snapshot is downloaded — email or WeChat it to anyone; no server needed. Start serve.py for online links.",
    "该分享链接不存在或已失效。": "This share link does not exist or has expired.",
    "无法读取分享内容，请确认本地服务已启动。": "Cannot read the share — make sure the local server is running.",
    "已导出为本地 HTML 文件": "Exported as a local HTML file",

    // --- view 07: write & cite ---
    "在正文里插入引用标记，切换格式时全文编号与参考文献表一次性重排。导出 Word 可直接继续排版。": "Insert citation markers in the text; switching the style renumbers everything and rebuilds the bibliography in one pass. Export to Word and keep typesetting.",
    "引文样式": "Citation style",
    "正文标注": "In-text markers",
    "数字 [1]": "Numeric [1]",
    "作者-年": "Author-year",
    "导出 Markdown": "Export Markdown",
    "导出 HTML": "Export HTML",
    "导出 Word .doc": "Export Word .doc",
    "复制参考文献表": "Copy bibliography",
    "文献库": "Library",
    "点击「引用」插入光标处": "Click an item to insert at the cursor",
    "正文": "Manuscript",
    "标记形如 [[PD:编号]]": "Markers look like [[PD:n]]",
    "实时预览": "Live preview",
    "参考文献": "References",
    "想要 Word 里原生「边写边引」？": "Want native Write & Cite inside Word?",
    "本机 Zotero 10.0.8 自带 Word / LibreOffice / WPS 插件：Zotero →": "Zotero 10.0.8 on this machine ships Word / LibreOffice / WPS plugins: Zotero →",
    "设置 → 引用 → 文字处理软件": "Settings → Cite → Word Processors",
    "安装插件，即可在 Word 里直接插入引文并一键换期刊格式（需先安装 Microsoft Word；当前机器未安装）。本工作台导出的": "Install the plugin to insert citations directly in Word and switch journal styles in one click (Microsoft Word required; not installed on this machine). This workbench exports",
    "与 RIS 可直接衔接这条链路。": "and RIS files that plug straight into that flow.",
    "点击插入引用": "Click to insert citation",
    "无匹配文献": "No matching items",
    "在上方写作，点左侧文献即可插入引用标记。": "Write above; click an item on the left to insert its citation marker.",
    "尚未插入引用": "No citations inserted yet",
    "全文引文已按新格式重排": "In-text citations renumbered in the new style",
    "还没有参考文献": "No references yet",

    // --- view 08: submission templates ---
    "期刊投稿模板": "Journal submission templates",
    "选择目标期刊，生成符合其结构与引文格式的稿件骨架，并把写作区样式同步切换过去。": "Pick a target journal to generate a manuscript skeleton matching its structure and citation style, and switch the writing area's style to match.",
    "生成模板": "Generate template",
    "稿件骨架": "Manuscript skeleton",
    "套用该期刊引文样式": "Apply this journal's citation style",
    "导出 .md": "Export .md",
    "先生成模板": "Generate a template first",
    "模板已导出": "Template exported",
    "稿件骨架已生成": "Manuscript skeleton generated",
    "自定义": "Custom",
    "目标期刊": "Target journal",
    "篇幅": "Length",
    "按官方作者指南": "Per official author guide",
    "引文格式": "Citation format",
    "可一键套用到写作区": "One click to apply to the writing area",

    // --- view 09: journal matcher ---
    "文稿匹配投稿期刊": "Match your manuscript to journals",
    "根据标题与摘要提取主题，结合 OpenAlex 期刊主题、影响力指标，以及你库内文献的期刊分布打分，给出 Top 建议。": "Extracts topics from your title and abstract, scores candidate journals on OpenAlex topic fit, impact metrics and the journal mix of your own references, and returns Top suggestions.",
    "论文标题": "Paper title",
    "摘要": "Abstract",
    "或从库中选一篇自动填入": "Or auto-fill from a library item",
    "匹配期刊": "Match journals",
    "打分 = 主题词重合 + 期刊主题匹配 + 影响力指标 + 你已有参考文献的期刊重叠度。结果附官网与官方选刊工具入口，可一键套用该刊模板。": "Score = topic overlap + journal topic fit + impact metrics + journal overlap with your own references. Results link to the journal site and official finders, with one-click template apply.",
    "填写标题或摘要": "Enter a title or abstract",
    "没能提取出主题词，补充一点摘要": "No topics extracted — add more abstract text",
    "按主题检索相关度与影响力指标入选": "Selected by topical relevance and impact metrics",
    "已填入该文献的题名与摘要": "Title and abstract filled in from the item",

    // --- dialogs / common ---
    "编辑": "Edit",
    "关闭": "Close",
    "输入内容": "Input",
    "确定": "OK",
    "取消": "Cancel",
    "保存": "Save",
    "题名": "Title",
    "题名 / 作者": "Title / author",
    "作者": "Authors",
    "作者（逗号分隔）": "Authors (comma-separated)",
    "期刊": "Journal",
    "WoS 入藏号 UT": "WoS accession no. (UT)",
    "卷": "Volume",
    "期": "Issue",
    "页码": "Pages",
    "标签（逗号分隔）": "Tags (comma-separated)",
    "摘要 / 笔记": "Abstract / notes",
    "已有分组": "Existing group",
    "或新建分组": "Or new group",
    "新分组名": "New group name",
    "新建分组名称": "New group name",
    "— 不选 —": "— none —",
    "打开": "Open",
    "加入库": "Add to library",
    "复制失败，请手动选择": "Copy failed — select manually",
    "已复制到剪贴板": "Copied to clipboard",
    "已保存": "Saved",
    "已导出": "Exported",
    "无": "None",
    "被引": "Cited",
    "最近保存：": "Last saved: ",
    "/ 单独一行 ": " / one per line ",
    "个分区": "partitions",
    "等": "et al.",
    "第一作者": "First author",
    "分组 / 标签": "Group / tags",
    "参考文献样式": "Reference style",

    // --- storage / status labels ---
    "存储方式": "Storage",
    "服务端": "Server",
    "本机": "Local",
    "浏览器 localStorage": "Browser localStorage",
    "文献总数": "Total items",
    "服务端同步": "Server sync",
    "云端页面 · 本机存储": "Cloud page · local storage",
    "本机存储": "Local storage",
    "服务端已连接 · 自动保存": "Server connected · autosave",
    "静态托管 · 浏览器本地保存": "Static hosting · browser-local storage",
    "本地自动保存 · 可导出备份": "Local autosave · exportable backup",
    "最近保存": "Last saved",
    "所有改动 0.7 秒后自动写入": "Changes auto-write 0.7s after each edit",
    "库里还没有文献": "The library is empty",
    "尚未保存": "Not saved yet",

    // --- toasts & statuses ---
    "先输入关键词或 DOI": "Enter keywords or a DOI first",
    "正在检索…": "Searching…",
    "没有匹配结果，换个关键词或数据源试试。": "No matches — try other keywords or a different source.",
    "元数据补全完成": "Metadata enrichment complete",
    "补全未成功，条目已保留原始信息": "Enrichment failed; items keep their original data",
    "没有解析出文献": "No papers parsed",
    "正在载入示例专题…": "Loading sample collection…",
    "示例数据获取失败，请直接检索": "Sample fetch failed — search directly",
    "已导出 CSL-JSON（Zotero / Pandoc / citeproc 通用）": "CSL-JSON exported (works with Zotero / Pandoc / citeproc)",
    "完整备份已导出（含分组与文稿）": "Full backup exported (groups and manuscripts)",
    "HerPaper 文献库": "HerPaper library",
    "该分组暂无文献": "No items in this group",
    "被引数据已更新": "Citation data updated",
    "库是空的，去「检索建库」收文献": "Library is empty — collect papers in Search & Build",
    "备份文件解析失败：": "Backup parse failed: ",
    "引文报告已导出": "Citation report exported",
    "分组已存在": "Group already exists",
    "分组已创建": "Group created",
    "先勾选文献": "Select items first",
    "把选中项加入分组": "Add selected items to a group",
    "批量添加标签": "Batch add tags",
    "标签已添加": "Tags added",
    "没有发现重复": "No duplicates found",
    "全文引文已按新格式重排": "In-text citations renumbered in the new style",
    "已导出 Markdown": "Markdown exported",
    "已导出 HTML": "HTML exported",
    "已导出 Word 可打开的 .doc": "Word-compatible .doc exported",
    "先粘贴内容": "Paste content first",
    "正在解析 DOI…": "Parsing DOIs…",
    "生成失败：": "Failed: ",
    "检索失败：": "Search failed: ",
    "保存失败：": "Save failed: ",
    "授权未完成": "Authorization incomplete",
    "授权失败：": "Authorization failed: ",
    "同步失败：": "Sync failed: ",
    "推送失败：": "Push failed: ",
    "渲染失败：": "Render failed: ",
    "拉取失败：": "Fetch failed: ",
    "刷新失败：": "Refresh failed: ",
    "网络请求失败": "Network request failed",
    "JSON 解析失败": "JSON parse failed",
    "未识别的文件格式": "Unrecognized file format",
    "服务端保存失败，已回退到本地": "Server save failed; fell back to local",
    "本地存储写入失败": "Local storage write failed",
    "已连接": "Connected",
    "未启用": "Not enabled",
    "未运行": "Not running",
    "启动 Zotero 桌面端": "Start Zotero desktop",
    "已配置": "Configured",
    "未配置": "Not configured",
    "需要 Zotero API Key": "Zotero API key required",
    "增量游标": "Incremental cursor",
    "尚无同步记录": "No sync record yet",
    "桥接状态": "Bridge status",
    "不可用": "Unavailable",
    "同步中…": "Syncing…",
    "请在 Zotero 弹出的对话框点 Allow…": "Click Allow in the Zotero dialog…",
    "本地写入授权成功": "Local write authorization granted",
    "配置已保存": "Config saved",
    "Web API v3 配置已保存到本机 data/config.json": "Web API v3 config saved to local data/config.json",
    "远端在同步期间发生变化（412 Precondition Failed），请重新执行增量拉取后重试。": "The remote changed during sync (412 Precondition Failed). Re-run the incremental pull and retry.",
    "检测到并发冲突，先拉取再推": "Concurrency conflict detected — pull first, then push",
    "推送完成": "Push complete",
    "推送未完成：": "Push incomplete: ",
    "同步未完成：": "Sync incomplete: ",
    "引用标记已插入": "Citation marker inserted",

    // --- Zotero howtos ---
    "Local API 可读免鉴权、写需运行时授权。增量同步按不透明版本游标执行：?since + format=versions 取差异 → 每批 ≤50 按 key 拉取 → /deleted 取墓碑 → 并发 LMV 变化自动重启。CSL-JSON 为内部交换格式。": "Local API reads without auth; writes need runtime authorization. Incremental sync runs on an opaque version cursor: ?since + format=versions for the diff → fetch per batch of ≤50 by key → /deleted for tombstones → auto-restart on concurrent LMV changes. CSL-JSON is the internal exchange format.",
    "Zotero 桌面端未运行或 Local API 未启用：Zotero → Settings → Advanced → 勾选 “Allow other applications on this computer to communicate with Zotero”。也可切到 Web API v3 并填入 API Key。": "Zotero desktop is not running or its Local API is off: Zotero → Settings → Advanced → check \"Allow other applications on this computer to communicate with Zotero\". Or switch to Web API v3 and enter an API key.",
    "本机服务未启动：运行 herpaper/start.command 后从 http://127.0.0.1:8765 打开；GitHub Pages 静态页无法访问本机 23119 端口。": "Local service not started: run herpaper/start.command, then open http://127.0.0.1:8765; static hosting cannot reach localhost port 23119.",

    // --- item rows / misc fragments ---
    "作者未知": "Unknown author",
    "期刊未知": "Unknown journal",
    "年份未知": "Unknown year",
    "[出版者不详]": "[publisher unknown]",
    "载入示例专题（5 篇）": "Load sample collection (5 items)",
    "暂无相关记录，先在引文报告刷新数据": "No related records yet — refresh citation data first",
    "WoS 全记录 ↗": "WoS full record ↗",
    "OpenAlex 全记录 ↗": "OpenAlex record ↗",
    "开放全文 ↗": "Open full text ↗",
    "期刊官网 ↗": "Journal site ↗",
    "WoS 期刊档案 ↗": "WoS journal profile ↗",
    "JANE 校验 ↗": "Check on JANE ↗",
    "参考": "Refs",
    "施引": "Citing",
    "1.0 = 世界均值": "1.0 = world average",
    "被引总数": "Total citations",
    "官方选刊工具：": "Official journal finders: ",

    // --- template descriptors ---
    "综合 · 自然科学": "General · Natural sciences",
    "约 3000 词（正文）": "~3000 words (main text)",
    "无小标题单段摘要，约 150 词": "Single-paragraph abstract, ~150 words, no subheadings",
    "Main text（无强制小标题）": "Main text (no mandatory subheadings)",
    "强调跨领域重大进展；Methods 置于正文后；参考文献上标数字。": "Emphasizes cross-field advances; Methods after the main text; numbered superscript citations.",
    "约 4500 词": "~4500 words",
    "约 125 词，无引用": "~125 words, no citations",
    "Research Article 结构；建议附 Cover Letter 与 3-5 位推荐审稿人。": "Research Article structure; cover letter and 3–5 suggested reviewers recommended.",
    "生命科学": "Life sciences",
    "约 3500-5000 词": "~3500–5000 words",
    "约 150 词单段": "Single paragraph, ~150 words",
    "要求 STAR Methods 结构化方法段与关键资源表。": "Requires the STAR Methods structured section and key resources table.",
    "综合 · 科学院院刊": "General · CAS bulletin",
    "约 4000 词 / 6 个版面": "~4000 words / 6 pages",
    "约 250 词结构化要求低": "~250 words, loose structure",
    "必填 Significance Statement（约 120 词）。": "A Significance Statement (~120 words) is required.",
    "生物技术": "Biotechnology",
    "约 3000 词": "~3000 words",
    "无小标题单段摘要": "Single-paragraph abstract, no subheadings",
    "方法与技术验证需完整，鼓励提供可复现代码与数据。": "Complete methods and technical validation; reproducible code and data encouraged.",
    "综合 · 开放获取": "General · Open access",
    "不限（建议 < 5000 词）": "No limit (<5000 words suggested)",
    "约 300 词，可结构化": "~300 words, structured allowed",
    "以方法严谨性而非创新性为录用标准；强制 Data Availability Statement。": "Methodological rigor over novelty; Data Availability Statement mandatory.",
    "医学 · 临床": "Medicine · Clinical",
    "结构化摘要（Background/Methods/Findings/Interpretation）": "Structured abstract (Background/Methods/Findings/Interpretation)",
    "Article 需结构化摘要，临床试验须注册号与 CONSORT。": "Articles need a structured abstract; trials require registration and CONSORT.",
    "结构化摘要（Importance/Objective/Design/Results/Conclusions）": "Structured abstract (Importance/Objective/Design/Results/Conclusions)",
    "结构化摘要与试验注册为硬性要求。": "Structured abstract and trial registration are hard requirements.",
    "计算机 · 人工智能": "Computer science · AI",
    "约 8000-10000 词（Regular Paper）": "~8000–10000 words (regular paper)",
    "约 200 词，无引用": "~200 words, no citations",
    "IEEE 双栏模板；需 Index Terms；参考文献方括号数字编号。": "IEEE two-column template; Index Terms required; bracketed numeric citations.",
    "机器学习": "Machine learning",
    "不限": "No limit",
    "约 150-250 词": "~150–250 words",
    "JMLR 自带 LaTeX 样式；强调理论或实证的完备性。": "JMLR LaTeX style; completeness of theory or empirics emphasized.",
    "材料科学": "Materials science",
    "约 3000 词（Communication 更短）": "~3000 words (shorter for Communications)",
    "约 150 词": "~150 words",
    "需 TOC 图与一句话亮点说明。": "TOC graphic and a one-line highlight required.",
    "科学通报": "Science Bulletin (Chinese)",
    "中文综合 · 国内期刊": "Chinese general · domestic journal",
    "约 5000 字": "~5000 characters",
    "中英文摘要各约 200 字": "Chinese and English abstracts, ~200 characters each",
    "执行 GB/T 7714-2015 著录格式，需中英文题名与摘要。": "GB/T 7714-2015 style; Chinese and English title and abstract required.",
    "经济研究": "Economic Research (Chinese)",
    "中文 · 经济学": "Chinese · Economics",
    "约 12000 字": "~12000 characters",
    "约 300 字 + JEL 分类号": "~300 characters + JEL codes",
    "内容提要": "Content abstract",
    "JEL 分类号": "JEL codes",
    "一、引言": "I. Introduction",
    "二、文献综述": "II. Literature review",
    "三、模型与数据": "III. Model and data",
    "四、实证结果": "IV. Empirical results",
    "五、结论": "V. Conclusion",
    "中文脚注与文后参考文献并用，需 JEL 分类。": "Chinese footnotes plus end references; JEL codes required.",
    "自定义期刊": "Custom journal",
    "通用": "Generic",
    "按投稿指南": "Per submission guide",
    "通用 IMRaD 骨架，结构可在生成后自行增删。": "Generic IMRaD skeleton; adjust sections after generation.",

    // --- template skeleton labels & guidance ---
    "题目": "Title",
    "关键词": "Keywords",
    "引言": "Introduction",
    "材料与方法": "Materials & methods",
    "方法": "Methods",
    "结果": "Results",
    "讨论": "Discussion",
    "结论": "Conclusion",
    "致谢": "Acknowledgements",
    "补充材料": "Supplementary materials",
    "（在此填写论文题名）": "(paper title here)",
    "背景一句话 → 待解决问题 → 方法 → 主要结果（含关键数据）→ 结论与意义。": "One-line background → the open problem → methods → key results (with data) → conclusion and significance.",
    "研究目的、方法、主要发现、结论，中文约 200 字；避免引用与缩写。": "Purpose, methods, key findings, conclusion; ~200 Chinese characters; avoid citations and abbreviations.",
    "用非专业读者能懂的语言概括发现与意义。": "Summarize the findings and significance for non-specialist readers.",
    "用 120 词左右说明为什么公众/领域外读者应关心这项工作。": "~120 words on why the public should care about this work.",
    "领域背景 → 已有工作与缺口 → 本文贡献（建议 3 段，末段列贡献点）。": "Field background → prior work and the gap → contributions (3 paragraphs; list them at the end).",
    "研究背景 → 文献述评 → 边际贡献与结构安排。": "Background → literature review → marginal contributions and structure.",
    "3-6 个检索词，避免与题名完全重复。": "3–6 search terms; avoid repeating the title verbatim.",
    "3-6 个，用分号分隔。": "3–6, separated by semicolons.",
    "样本/数据/设备/算法/统计方法，细致到可复现；注明伦理与数据可得性。": "Samples / data / equipment / algorithms / statistics, detailed enough to reproduce; note ethics and data availability.",
    "材料来源、实验流程、参数设置、统计检验与软件版本。": "Material sources, procedures, parameters, statistical tests, software versions.",
    "数据来源、变量定义、模型设定与识别策略。": "Data sources, variable definitions, model specification, identification strategy.",
    "按逻辑而非时间顺序组织，每张图表一句话结论。": "Organize by logic, not chronology; one-sentence takeaway per figure.",
    "核心估计结果、稳健性检验与异质性分析。": "Core estimates, robustness checks, heterogeneity analysis.",
    "解释、与既有文献对照、局限与展望。": "Interpretation, comparison with prior literature, limitations, outlook.",
    "机制解释、与文献对话、政策含义与局限。": "Mechanisms, dialogue with the literature, policy implications, limitations.",
    "凝练结论，不重复结果段数据。": "Concise conclusion; do not repeat results data.",
    "主要结论与建议，不引入新结果。": "Main conclusions and recommendations; no new results.",
    "由「边写边引」自动生成，切换样式时全文重排；此处留空即可。": "Auto-generated by Write & Cite; reflows when the style changes; leave empty.",
    "由「边写边引」自动生成，执行 GB/T 7714-2015。": "Auto-generated by Write & Cite; GB/T 7714-2015.",
    "IEEE 关键词，按字母序。": "IEEE keywords, alphabetical.",
    "编辑称谓 → 一句话创新点 → 为什么适合本刊 → 原创性与无一稿多投声明。": "Editor salutation → one-line novelty → fit for this journal → originality and no dual-submission statement.",
    "数据存放库、 accession number 或获取限制说明。": "Data repository, accession number, or access restrictions.",
    "声明无利益冲突或具体披露。": "State no conflicts of interest or disclose specifics.",
    "（在此撰写）\n": "(write here)\n",
    "\n\n> 目标期刊：": "\n\n> Target journal: ",
    "\n> 篇幅：": "\n> Length: ",
    "\n> 摘要要求：": "\n> Abstract requirements: ",
    "\n> 参考文献样式：": "\n> Reference style: ",
    "\n\n## 参考文献\n\n": "\n\n## References\n\n",
    "<h1>论文正文</h1>": "<h1>Main text</h1>",
    "<h2>参考文献</h2><ol>": "<h2>References</h2><ol>",
    "\n---\n投稿提示：": "\n---\nSubmission notes: ",
    "\n官方作者指南：": "\nOfficial author guide: ",

    // --- placeholders (attribute sweep) ---
    "输入题名、主题、作者或 DOI，例如：CRISPR gene editing": "Title, topic, author or DOI, e.g.: CRISPR gene editing",
    "一行一个 DOI，也可直接粘贴 WoS/EndNote 导出文本或 BibTeX\n10.1038/nbt.3439\n10.1126/science.1258096": "One DOI per line; you can also paste WoS/EndNote text or BibTeX\n10.1038/nbt.3439\n10.1126/science.1258096",
    "Zotero API Key（仅存本机）": "Zotero API key (stored locally)",
    "检索题名 / 作者 / 期刊 / 摘要 / 标签": "Search title / author / journal / abstract / tags",
    "例如：课题组 · 基因编辑专题": "e.g.: Lab · Gene editing collection",
    "给合作者的说明（可选）": "Note to collaborators (optional)",
    "筛选文献…": "Filter items…",
    "在这里写论文…\n\n示例：已有研究表明基因编辑效率可显著提升 [[PD:1]]，但脱靶效应仍需控制。": "Write your paper here…\n\nExample: Studies show gene-editing efficiency can be markedly improved [[PD:1]], but off-target effects remain a concern.",
    "或输入自定义期刊名": "Or enter a custom journal",
    "粘贴摘要，越完整匹配越准…": "Paste the abstract; the more complete, the better the match…",
    "新分组名": "New group name",

    // --- coverage-audit additions (2026-11-14 sweep) ---
    "例如：Single-cell atlas of CRISPR-edited renal organoids": "e.g., Single-cell atlas of CRISPR-edited renal organoids",
    "以 DOI/题名跳转": "Jump via DOI/title",
    "正在检索 OpenAlex 期刊库并打分…": "Searching and scoring the OpenAlex journal index…",
    "没有检索到匹配期刊，换个标题或补充摘要再试。": "No matching journals found. Try another title or a fuller abstract.",
    "已移除": "Removed",
    "· 选中项": "· selected",
    "· 最近 20 篇": "· latest 20",
    "arXiv 响应解析失败": "Failed to parse the arXiv response",
    "套用该刊模板": "Use this journal's template",
    "可改用「粘贴导入」，或在本地服务模式下由代理转发。": "Try Paste Import instead, or switch to local-server mode where the proxy forwards the request.",

    // --- dark mode / command palette / shortcuts / citation map (2026-11-14) ---
    "切换到深色模式": "Switch to dark mode",
    "切换到浅色模式": "Switch to light mode",
    "切换深浅主题": "Toggle dark / light theme",
    "外观": "Appearance",
    "命令面板": "Command palette",
    "命令面板输入": "Command palette input",
    "输入命令或检索文献…": "Type a command or search your library…",
    "没有匹配项": "No matches",
    "跳转": "Jump",
    "动作": "Action",
    "文献": "Item",
    "导出完整备份 (.json)": "Export full backup (.json)",
    "导出 RIS": "Export RIS",
    "导出 BibTeX": "Export BibTeX",
    "导出 CSV": "Export CSV",
    "生成共享快照": "Create a share snapshot",
    "共享": "Share",
    "同步": "Sync",
    "外观主题切换": "Appearance toggle",
    "键盘快捷键": "Keyboard shortcuts",
    "打开检索框": "Focus the search box",
    "g 然后 1…9": "g then 1…9",
    "切换视图": "Switch view",
    "快捷键帮助": "Shortcut help",
    "关闭弹窗": "Close dialogs",
    "↑↓ 选择": "↑↓ Navigate",
    "Enter 执行": "Enter Run",
    "Esc 关闭": "Esc Close",
    "命令面板内：↑↓ 选择 · Enter 执行 · Esc 关闭。": "In the palette: ↑↓ navigate · Enter run · Esc close.",
    "引文图谱": "Citation map"
  };

  /* Parameterized strings: rendered counters/toasts the exact map cannot hit.
   * Applied with String.replace in order; anchored patterns first, then inline
   * label fragments that survive inside mixed nodes. */
  var PATTERNS = [
    [/^已连续使用 (\d+) 天$/, "Active for $1 day(s) in a row"],
    [/^文献对比矩阵（(\d+) 篇 · 选中项）$/, "Compare matrix ($1 selected items)"],
    [/^文献对比矩阵（(\d+) 篇 · 最近 20 篇）$/, "Compare matrix (latest $1 items)"],
    [/^(\d+) 条$/, "$1 items"],
    [/^引文链条 · (.+)$/, "Citation chain · $1"],
    [/^引文图谱 · (.+)$/, "Citation map · $1"],
    [/^视图 (0\d)$/, "View $1"],
    [/^该文引用 (\d+) 篇$/, "References of this paper: $1"],
    [/^引用该文 (\d+) 篇$/, "Works citing this paper: $1"],
    [/^本文 · 被引 (\d+)$/, "This paper · cited $1"],
    [/^(\d+) 个分区$/, "$1 partitions"],
    [/^已同步云端 · (\d+) 篇$/, "Cloud-synced · $1 items"],
    [/^第 (\d+) 页 · 约 ([\d,]+) 条命中$/, "Page $1 · ~$2 hits"],
    [/^第 (\d+) 页$/, "Page $1"],
    [/^最近保存：(.+)$/, "Last saved: $1"],
    [/^正在联网补全 (\d+) 条元数据…$/, "Enriching metadata for $1 items online…"],
    [/^已补全 (\d+) 条$/, "Enriched $1 items"],
    [/^正在解析 (\d+) 个 DOI…$/, "Parsing $1 DOIs…"],
    [/^导入完成：新增 (\d+) 篇，补全 (\d+) 篇$/, "Import done: $1 added, $2 enriched"],
    [/^备份已还原：(\d+) 篇$/, "Backup restored: $1 items"],
    [/^已与现有库合并：新增 (\d+) 篇$/, "Merged into the library: $1 added"],
    [/^示例专题已加入：(.+)$/, "Sample collection added: $1"],
    [/^含 (\d+) 个分组$/, "across $1 groups"],
    [/^共 (\d+) 篇 · 自包含只读快照$/, "$1 items · self-contained read-only snapshot"],
    [/^上次刷新后共 (\d+) 篇 · 点击刷新获取最新被引$/, "$1 items since the last refresh · click refresh for the latest citations"],
    [/^刷新中 (\d+)…$/, "Refreshing $1…"],
    [/^已加入分组「(.+)」$/, "Added to group \"$1\""],
    [/^已移除 (\d+) 篇$/, "Removed $1 items"],
    [/^已合并 (\d+) 条重复文献$/, "Merged $1 duplicate items"],
    [/^确定从库中移除选中的 (\d+) 篇文献？（导出备份可恢复）$/, "Remove the $1 selected items from the library? (A backup export can restore them)"],
    [/^已选 (\d+) 篇。选择已有分组，或输入新名称。$/, "$1 selected. Pick an existing group or enter a new name."],
    [/^同步完成，库内共 (\d+)$/, "Sync done; the library now holds $1"],
    [/^推送完成 · 成功 (\d+) 条 · 新游标 (.+)$/, "Push done · $1 items · new cursor $2"],
    [/^被引 (\d+)$/, "Cited $1"],
    [/^施引文献 (\d+)$/, "Citing works $1"],
    [/^已解析 (\d+)$/, "Parsed $1"],
    [/^出链 · 该文引用的文献（(\d+)）$/, "Outgoing · references of this paper ($1)"],
    [/^入链 · 引用该文的文献（(\d+) \/ 共 (\d+)）$/, "Incoming · works citing this paper ($1 of $2)"],
    [/^相关记录 · (.+)$/, "Related records · $1"],
    [/^写作区引文样式已切换为 (.+)$/, "Writing-area style switched to $1"],
    [/^已切换到「(.+)」模板$/, "Switched to the $1 template"],
    [/^刊名\/主题词命中：(.+)$/, "Journal/topic hits: $1"],
    [/^期刊主题匹配：(.+)$/, "Journal topic match: $1"],
    [/^你已有 (\d+) 篇参考文献发表于同类期刊$/, "You already have $1 references in journals of this class"],
    [/^近两年篇均被引 (\d+)$/, "Citations per item, last 2 years: $1"],
    [/^收录 (\d+) 篇$/, "$1 items indexed"],
    [/^收录 (\d+)$/, "$1 indexed"],
    [/^按题名逐条检索 (\d+) 条…$/, "Searching $1 titles one by one…"],
    [/^加入 (\d+)，补全 (\d+)$/, "Added $1, enriched $2"],
    [/^增量同步完成 · 模式 (.+?) · 游标 (.+?) · 版本差异 (\d+) 条 \/ 实际下载 (\d+) 条 \/ 删除 (\d+) 条 · 合并进库 新增 (\d+)，更新 (\d+)$/, "Incremental sync done · mode $1 · cursor $2 · version diff $3 / downloaded $4 / deleted $5 · merged: +$6, updated $7"],
    [/^(\d+) 篇 · (.+)$/, "$1 items · $2"],
    [/· 被引 /g, "· cited "],
    [/WoS 入藏号/g, "WoS UT"],
    [/等 (\d+) 人/g, "et al. (+$1)"],
    [/等 (\d+) 个分区/g, "across $1 partitions"],
    [/· 标记 /g, "· marker "],
    [/ · 出版方 /g, " · publisher "]
  ];

  function translateText(t) {
    var trimmed = t.trim();
    if (Object.prototype.hasOwnProperty.call(DICT, trimmed)) return DICT[trimmed];
    var out = t;
    for (var i = 0; i < PATTERNS.length; i++) out = out.replace(PATTERNS[i][0], PATTERNS[i][1]);
    return out;
  }

  // Never touch the user's own words (values inside these areas are the
  // user's text). Placeholders are instructional chrome, not user content,
  // so the attribute pass below uses a narrower skip and translates them.
  var SKIP = 'textarea, #manuscript, #templatePreview, #preview, #pasteBox, #matchAbstract, #shareNote, script, style';
  var ATTR_SKIP = 'script, style';

  var root = document.querySelector('.herpaper-embed') || document.body;
  var scheduled = false;
  var applying = false;

  function sweep(node) {
    applying = true;
    try {
      var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      while (w.nextNode()) {
        var n = w.currentNode;
        var p = n.parentNode;
        if (!p) continue;
        if (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE') continue;
        if (p.closest && p.closest(SKIP)) continue;
        if (!/[\u4e00-\u9fff]/.test(n.nodeValue)) continue;
        var t2 = translateText(n.nodeValue);
        if (t2 !== n.nodeValue) n.nodeValue = t2;
      }
      var els = node.querySelectorAll ? node.querySelectorAll('[placeholder],[title],[aria-label]') : [];
      for (var k = 0; k < els.length; k++) {
        var el = els[k];
        if (el.closest && el.closest(ATTR_SKIP)) continue;
        var attrs = ['placeholder', 'title', 'aria-label'];
        for (var a = 0; a < attrs.length; a++) {
          var v = el.getAttribute(attrs[a]);
          if (!v || !/[\u4e00-\u9fff]/.test(v)) continue;
          var t3 = translateText(v);
          if (t3 !== v) el.setAttribute(attrs[a], t3);
        }
      }
    } finally {
      applying = false;
    }
  }

  function schedule() {
    if (scheduled || applying) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; sweep(root); }, 80);
  }

  sweep(root); // static markup injected from index.html
  var mo = new MutationObserver(function () { if (!applying) schedule(); });
  mo.observe(root, { childList: true, subtree: true, characterData: true });

  // Route remounts clear the observer via the shared teardown registry.
  (window.PD_HERPAPER_TEARDOWN = window.PD_HERPAPER_TEARDOWN || []).push(function () { mo.disconnect(); });
})();
