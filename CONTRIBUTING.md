# 贡献指南 · Contributing

感谢你愿意为 HerPaper 出力！这是一个刻意保持**纯静态零构建**的项目，贡献流程也因此很轻。

Thank you for improving HerPaper! This project deliberately stays a **zero-build static app**, so contributing is intentionally lightweight.

## 硬约束 · Hard constraints

1. **同步契约**：上游 <https://github.com/Fudan2026/supro> 在构建时只拉取以下文件集合——`index.html`、`style.css`、`core.js`、`app.js`、`integrations.js`、`cloud-sync.js`、`herpaper-i18n.js`、`promo.html`、`promo.css`、`serve.py`、`start.command`、`zotero_sync.py` 与 `assets/` 下的四个图标。
   **任何运行时新依赖必须内联进上述文件**，否则 supro.si 内嵌版会拿不到。
2. **零构建**：不引入打包器、框架、npm 运行时依赖。测试只用 Node 内置 `node:test`。
3. **本地优先**：不得新增任何默认出网请求或遥测。新的联网能力必须显式由用户触发，并在 README「隐私」一节登记域名。
4. **渐进增强**：核心内容与操作在无 JS 时可用或可读；动效尊重 `prefers-reduced-motion`。
5. **CSS 作用域兼容**：`style.css` 会被 supro 的构建脚本按 `.herpaper-scope` 选择器自动作用域化——新增 CSS 避免非常规 at-rule，选择器保持朴素。

## 开发流程 · Workflow

```bash
git checkout -b feat/your-feature
python3 -m http.server 8000     # 或 python3 serve.py
# ...改动...
node --test tests/               # 全部测试必须通过
```

- 提交信息用中英均可，但请说清「为什么」。
- 每个功能一个 PR；修 bug 请附最小复现说明。
- 涉及引文格式 / 解析器的改动，**必须**先在 `tests/` 增加对应用例（我们靠测试锁住 GB/T 7714、APA 7 等格式的正确性）。
- 涉及界面文案的改动，**必须**同步更新 `herpaper-i18n.js` 字典（CI 的 i18n 覆盖审计会拦截遗漏）。

## 三种运行模式都要照顾 · Test all three modes

改动后请至少手动过一遍：静态托管模式（http.server）、本地服务模式（`python3 serve.py`）、无 JS（关掉 JavaScript 看核心内容是否可读）。

## 行为准则 · Code of conduct

对事不对人，保持善意与耐心。中文或英文交流都可以。
