# PDF 知识树 · Knowledge Atlas

独立运行的 PDF 拆页 / 重组工具：把 PDF 拆成单页，放进任意层级的知识树，再按自己的顺序重新组合成一本新的 PDF。

## 两个主要动作

- **归页**：把任意 PDF 的任意页面拖进知识树的任意节点，同一页可以出现在多个节点里。
- **组合成主题**：把挑好的页面组合成一个「主题」，主题存进主题库；主题里可以改封面、调页序，随时整本导出成 PDF。

左侧目录默认常驻，点目录标题右侧的收起按钮可以变成抽屉，点遮罩或再次点击即可关闭，让出中间的空间。

## 运行

    npm install
    npm run dev      # 界面 http://127.0.0.1:5174

打包后单进程运行（前后端同一端口）：

    npm run build
    npm start        # http://127.0.0.1:8890

端口被占用时，可以换一个：Windows 用 `set PORT=8900 && npm run dev`，
macOS / Linux 用 `PORT=8900 npm run dev`。

## 数据存放

所有 PDF 原文件、页面清单和树结构都保存在本机 `data/pdf-library`，不会上传到任何服务器。
可用环境变量 `PDF_STUDIO_DATA_DIR` 换到别处（例如移动硬盘）。

## 主要文件

- `server/pdf-studio.ts` — 导入、归页、排序、导出等全部接口
- `server/index.ts` — 独立服务入口
- `src/pages/PdfStudioPage.tsx` — 三栏工作台
- `src/components/pdf` — PDF 单页渲染
- `src/styles.css` — 工作台样式与三套主题

## 设计系统

视觉层基于一套开源组件拼装，不含任何私有素材：

- 色阶：[Radix Colors](https://www.radix-ui.com/colors)（MIT）——纸白 / 夜航 / 墨蓝三套主题
- 字体：Inter、Instrument Serif、JetBrains Mono（均为 SIL OFL），中文回落到系统字体
- 图标：Lucide（ISC）

主题色板在 `src/styles.css` 顶部集中定义，改一处即可全局换色。

## 让 Codex 直接操作它

这套系统带一个 MCP 服务，Codex 可以在对话里直接整理你的 PDF。

- 服务代码：`mcp/server.mjs`
- 已注册进 `~/.codex/config.toml`（`[mcp_servers.pdf_atlas]`）
- 配套技能：`skill/pdf-knowledge-tree/SKILL.md`，同时安装到 `~/.codex/skills/pdf-knowledge-tree/`

MCP 提供 14 个工具：总览、导入、列页、搜索、建/改/删节点、归页、排序、组合主题、主题库增删改、导出。
应用没启动时，MCP 会自动把应用拉起来（约 2-3 秒）。

在 Codex 里可以直接说：

- 「把这几个 PDF 导入，按主题搭一棵知识树」
- 「找出讲注意力机制的那几页，组合成一本小册子导出」
- 「看看我的知识树现在长什么样」
