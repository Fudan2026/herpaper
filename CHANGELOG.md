# Changelog

本项目的所有重要变更都记录在此文件中。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

All notable changes are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semantic versioning.

## [Unreleased] — v1.0.0 候选 · current wave

### Added
- OSS 仓库基建：双语 `README.md`、MIT `LICENSE`、`CHANGELOG.md`、`CONTRIBUTING.md`。
- 测试套件 `tests/`（node:test 零依赖）：WoS/RIS/BibTeX/CSV/CSL-JSON 解析器、7 种引文样式、CSL 往返、i18n 字典对界面静态文案的 100% 覆盖审计；`.github/workflows/ci.yml`。
- 独立模式中英文切换（supro 嵌入态仍由平台 locale 控制）。
- 暗色模式（跟随系统 + 手动切换持久化）。
- 命令面板 Ctrl/Cmd+K（库内检索、跳转九视图、常用动作）与快捷键（`/` 聚焦检索、`g1..g9` 切视图、`?` 帮助）。
- 引文网络 SVG 力导向图（视图 03，零依赖）。
- PWA：`manifest.webmanifest` + `sw.js` 离线缓存（仅独立托管时注册）。
- localStorage 配额守卫：写入失败自动导出 JSON 备份。
- promo 页 SEO / Open Graph 元数据。

### Fixed
- supro 嵌入下检索结果键盘可达性与焦点管理（骨架屏、`aria-live` toast、`focus-visible`）。

## [0.5.0] — 2026-11-12

- 2026 福启林杯备赛功能：arXiv (q-fin) 与 Semantic Scholar 两个检索源、顶栏设备日期徽章（截图合规凭据）、连续使用打卡、库内对比矩阵、反馈草稿导出、promo 页大赛专区。

## [0.4.0] — 2026-11-11

- 自愿开启的 SuPro 云端同步：默认关闭（本地优先、零云成本），视图 02 开关卡持久化 `herpaper.cloudsync.enabled`。
- CI：每次推送 main 触发 `repository_dispatch: herpaper-updated`，驱动 supro.si 重新拉取部署。

## [0.3.0] — 2026-11-10

- Zotero v3 增量同步（Local API 23119 / Web API）、CSL-JSON 内部规范与互通、OpenAlex 引文链条（参考文献 / 施引文献批量入库）。
- 静态托管模式（GitHub Pages）：跳过本地 API 探测，直接连接开放学术索引；可分享的预填检索 URL。
- 最终单色产品图标（AI 生成人像）应用于应用与 promo 页。

## [0.1.0] — 2026-11-10

- 首个可用版本（PaperDesk）：检索建库、WoS/EndNote/Zotero 文件导入、跨平台同步、全记录深链、引文报告、管理分析、只读共享、边写边引、投稿模板、期刊匹配九视图。
