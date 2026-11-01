---
name: pdf-knowledge-tree
description: 操作本机「PDF 知识树」系统——把 PDF 拆成单页、搭出任意层级的知识树、把挑好的页面组合成主题并导出成新书。当用户要整理一批 PDF、搭建知识体系/知识树、把 PDF 按主题归类、查某个概念散落在哪几页、把若干页组合成一本小册子或一个主题时使用；也用于查看知识树现状、调整节点层级与页序、导出成书。触发词：PDF 知识树、拆 PDF、搭知识树、整理 PDF、归类 PDF、组合成书、主题库、知识地图。
---

# PDF 知识树

本地运行的 PDF 拆页与重组工具：把 PDF 拆成单页，放进任意层级的知识树，再按自己的顺序组合成新的 PDF。

- 应用目录：`D:\MT-ATOM\AS-开发类\Agent+微课\PDF知识树`
- 界面：http://127.0.0.1:5174 （人在界面上操作时用这个地址）
- 接口：http://127.0.0.1:8890/api/pdf-studio
- 数据：`PDF知识树\data\pdf-library`（PDF 原文件与树结构都只存在本机）
- 导出默认落盘：`PDF知识树\data\exports`

MCP 服务（`mcp\server.mjs`）会在需要时自动拉起应用，无需手动启动。

## 工具清单

| 工具 | 用途 |
| --- | --- |
| `pdf_overview` | 总览：文档、树结构、主题、统计。任何操作前先看它 |
| `pdf_import` | 导入本机 PDF（绝对路径，可批量），按页拆开 |
| `pdf_list_pages` | 列页面，可按文档过滤、按关键词过滤 |
| `pdf_search` | 在所有页面文字里搜索，给出命中页与片段 |
| `pdf_create_node` | 新建节点（父节点可省略=根级） |
| `pdf_update_node` | 改名 / 换上级 / 改说明 / 改标记色 |
| `pdf_delete_node` | 删节点及其子节点（页面不删） |
| `pdf_assign_pages` | 页面加入节点或移出节点（同一页可属于多个节点） |
| `pdf_reorder_pages` | 调整节点内页序（传完整新页序） |
| `pdf_create_theme` | 把页面组合成主题存入主题库 |
| `pdf_list_themes` | 主题库列表（含页序） |
| `pdf_update_theme` | 改主题名/说明/封面/页序 |
| `pdf_delete_theme` | 删主题（页面不删） |
| `pdf_export` | 导出 PDF：范围 node / branch / theme / selection |

## 三种常见做法

### 一、导入并按主题归类

1. `pdf_import` 传本机 PDF 路径数组。
2. `pdf_list_pages` 拿到页面 id 与文字摘要。
3. 读 `pdf_overview` 找到合适的父节点 id；没有合适的就 `pdf_create_node` 建一个。
4. `pdf_assign_pages` 把页 id 分批放进对应节点（先 add，最后一步确认无误再继续）。

### 二、找散落的页并组合成一本

1. `pdf_search` 找关键词，命中的 `pageId` 就是页面 id。
2. 按想要成书的顺序排好 `pageIds`；需要的话先用 `pdf_create_theme` 或 `pdf_update_theme` 定页序。
3. `pdf_export`（scope=`theme`）导出，拿到文件路径后告诉用户文件在哪。

### 三、检查与整理

- `pdf_overview` 看树的骨架；缺层级用 `pdf_create_node` 补；归错位用 `pdf_update_node` 改 `parentId`。
- 页序不对用 `pdf_reorder_pages`，注意要传该节点**完整**的页序，不是增量。

## 注意

- 页面 id 形如 `pdf-xxxxx:3`，只有 `pdf_list_pages` / `pdf_search` / `pdf_overview` 会给，不要自己拼。
- 节点 id 形如 `pdf-node-xxxxx`，`pdf_overview` 的树里带 `path`（如 `AI / 认知 / 注意力`），按 path 认人比按 id 稳。
- 删除只影响树上的归位，不会删掉 PDF 原文件和页面内容。
- 导出文件默认写到 `data\exports`，也可以给 `pdf_export` 传 `outputPath` 指定位置。
- 用户要的是「整理」而不是「搬家」时，默认不要删除任何东西；先报告要动什么，再动手。
