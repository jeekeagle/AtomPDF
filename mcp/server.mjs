/**
 * PDF 知识树 · MCP 服务
 *
 * 让 Codex 直接操作本地知识树：导入 PDF、建节点、归页、组合主题、导出成书。
 * 通过本机接口 (默认 http://127.0.0.1:8890/api/pdf-studio) 与应用通信。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = process.env.PDF_STUDIO_API || 'http://127.0.0.1:8890/api/pdf-studio';
const EXPORT_DIR = path.join(APP_ROOT, 'data', 'exports');

const log = (...args) => console.error('[pdf-atlas]', ...args);

/* ------------------------------------------------------------------ */
/* 与应用通信                                                          */
/* ------------------------------------------------------------------ */

async function ping() {
  try {
    const response = await fetch(API_BASE, { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function startAppIfNeeded() {
  if (await ping()) return true;
  log('接口未启动，正在启动应用…');
  try {
    const child = spawn('cmd.exe', ['/d', '/c', 'npm', 'run', 'dev'], {
      cwd: APP_ROOT,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
  } catch (error) {
    log('启动失败：', error?.message || error);
    return false;
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await ping()) return true;
  }
  return false;
}

async function api(pathname, init = {}) {
  if (!(await startAppIfNeeded())) {
    throw new Error(
      `无法连接 PDF 知识树服务（${API_BASE}）。请先双击「${path.join(
        APP_ROOT,
        '启动.cmd'
      )}」启动。`
    );
  }
  const response = await fetch(API_BASE + pathname, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `请求失败 (${response.status})`);
  }
  return response.json();
}

const nowIso = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* 工具定义                                                            */
/* ------------------------------------------------------------------ */

const tools = [
  {
    name: 'pdf_overview',
    description:
      '查看 PDF 知识树的总览：工作区名称、已导入的文档、各级节点（树形）、已组合的主题和统计数字。开始任何操作前先调用它。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'pdf_import',
    description:
      '把本地 PDF 文件导入知识树，按文件名和页码拆成单页。传入本机绝对路径的数组，可一次导入多个。',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: '本机 PDF 文件的绝对路径'
        }
      },
      required: ['paths']
    }
  },
  {
    name: 'pdf_list_pages',
    description:
      '列出可用的页面。可按文档筛选，也可按关键词过滤（匹配页码或页面文字摘要）。返回每页的 id、所属文档、页码和文字摘要。',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: '只看某一个文档，填则全部' },
        keyword: { type: 'string', description: '关键词，匹配页码或页面文字' },
        limit: { type: 'number', description: '最多返回多少页，默认 60' }
      }
    }
  },
  {
    name: 'pdf_search',
    description:
      '在所有已导入 PDF 的页面文字里搜索，返回命中页面及片段。按相关度排序。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '要搜索的关键词' },
        limit: { type: 'number', description: '最多返回多少条，默认 30' }
      },
      required: ['keyword']
    }
  },
  {
    name: 'pdf_create_node',
    description:
      '在知识树里新建一个节点（可无限层级）。父节点不填就是根节点。返回新节点 id。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '节点名称，例如「注意力机制」' },
        parentId: { type: 'string', description: '父节点 id，不填则建在根级' },
        note: { type: 'string', description: '节点说明' },
        tone: {
          type: 'string',
          enum: ['brick', 'teal', 'gold', 'ink'],
          description: '标记色，默认 teal'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'pdf_update_node',
    description: '修改节点：改名、换上级节点、改进说明或标记色。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '节点 id' },
        title: { type: 'string' },
        parentId: { type: 'string', description: '新的父节点 id，填空字符串表示移到根级' },
        note: { type: 'string' },
        tone: { type: 'string', enum: ['brick', 'teal', 'gold', 'ink'] }
      },
      required: ['id']
    }
  },
  {
    name: 'pdf_delete_node',
    description: '删除节点及其全部子节点。节点里的页面不会被删除，只是从树上移除。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '节点 id' } },
      required: ['id']
    }
  },
  {
    name: 'pdf_assign_pages',
    description:
      '把页面加入节点，或从节点移出页面。同一页可以同时属于多个节点。',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '节点 id' },
        pageIds: { type: 'array', items: { type: 'string' }, description: '页面 id 列表' },
        action: { type: 'string', enum: ['add', 'remove'], description: '加入或移出' }
      },
      required: ['nodeId', 'pageIds', 'action']
    }
  },
  {
    name: 'pdf_reorder_pages',
    description:
      '调整节点里页面的先后顺序。传入该节点完整的新页序（页面 id 列表）。',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        pageIds: { type: 'array', items: { type: 'string' } }
      },
      required: ['nodeId', 'pageIds']
    }
  },
  {
    name: 'pdf_create_theme',
    description:
      '把选好的页面组合成一个主题并存进主题库。页序就是传入的顺序，可指定封面页。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '主题名称' },
        pageIds: { type: 'array', items: { type: 'string' }, description: '按顺序排列的页面 id' },
        note: { type: 'string', description: '主题说明' },
        coverPageId: { type: 'string', description: '封面页 id，默认第一页' }
      },
      required: ['title', 'pageIds']
    }
  },
  {
    name: 'pdf_list_themes',
    description: '列出主题库里的所有主题：名称、说明、页数、封面和页序。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'pdf_update_theme',
    description: '修改主题：改名、改说明、换封面或调整页序（传入完整的新页序）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        note: { type: 'string' },
        coverPageId: { type: 'string' },
        pageIds: { type: 'array', items: { type: 'string' } }
      },
      required: ['id']
    }
  },
  {
    name: 'pdf_delete_theme',
    description: '从主题库删除一个主题。页面本身不会被删除。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  {
    name: 'pdf_export',
    description:
      '把内容导出成新的 PDF 并保存到本机。范围可选：node（某个节点）、branch（节点及其全部子级）、theme（某个主题）、selection（指定的页面列表）。',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['node', 'branch', 'theme', 'selection'] },
        nodeId: { type: 'string', description: 'scope 为 node / branch 时的节点 id' },
        themeId: { type: 'string', description: 'scope 为 theme 时的主题 id' },
        pageIds: { type: 'array', items: { type: 'string' }, description: 'scope 为 selection 时的页面 id' },
        title: { type: 'string', description: '导出文件名（不含扩展名）' },
        outputPath: { type: 'string', description: '保存到哪个绝对路径，默认存到 data/exports' }
      },
      required: ['scope']
    }
  }
];

/* ------------------------------------------------------------------ */
/* 工具实现                                                            */
/* ------------------------------------------------------------------ */

const allPages = (state) =>
  state.documents.flatMap((document) =>
    document.pages.map((page) => ({ document, page }))
  );

const nodeLabel = (state, node) => {
  const path = [];
  let cursor = node;
  const seen = new Set();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.unshift(cursor.title);
    cursor = state.nodes.find((item) => item.id === cursor.parentId);
  }
  return path.join(' / ');
};

const buildTree = (state) => {
  const children = (parentId) =>
    state.nodes
      .filter((node) => node.parentId === parentId)
      .sort((a, b) => a.order - b.order);
  const walk = (node, depth) => ({
    id: node.id,
    title: node.title,
    note: node.note,
    depth,
    pageCount: node.pages.length,
    path: nodeLabel(state, node),
    children: children(node.id).map((child) => walk(child, depth + 1))
  });
  return children(null).map((node) => walk(node, 0));
};

const handlers = {
  async pdf_overview() {
    const state = await api('');
    return {
      workspaceName: state.workspaceName,
      stats: state.stats,
      documents: state.documents.map((document) => ({
        id: document.id,
        name: document.name,
        pageCount: document.pageCount,
        importedAt: document.importedAt
      })),
      nodes: buildTree(state),
      themes: state.themes.map((theme) => ({
        id: theme.id,
        title: theme.title,
        note: theme.note,
        pageCount: theme.pages.length,
        coverPageId: theme.coverPageId
      }))
    };
  },

  async pdf_import({ paths }) {
    const results = [];
    for (const filePath of paths) {
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        results.push({ path: resolved, ok: false, error: '文件不存在' });
        continue;
      }
      const buffer = fs.readFileSync(resolved);
      const state = await api('/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'X-File-Name': encodeURIComponent(path.basename(resolved))
        },
        body: buffer
      });
      const document = state.documents[0];
      results.push({
        path: resolved,
        ok: true,
        documentId: document.id,
        name: document.name,
        pageCount: document.pageCount
      });
    }
    return { imported: results };
  },

  async pdf_list_pages({ documentId, keyword, limit = 60 }) {
    const state = await api('');
    const needle = (keyword || '').trim().toLowerCase();
    const hits = allPages(state)
      .filter(({ document }) => !documentId || document.id === documentId)
      .filter(({ document, page }) => {
        if (!needle) return true;
        return (
          document.name.toLowerCase().includes(needle) ||
          String(page.number).includes(needle) ||
          page.textPreview.toLowerCase().includes(needle)
        );
      })
      .slice(0, limit);
    return {
      total: hits.length,
      pages: hits.map(({ document, page }) => ({
        pageId: page.id,
        documentId: document.id,
        document: document.name,
        number: page.number,
        text: page.textPreview
      }))
    };
  },

  async pdf_search({ keyword, limit = 30 }) {
    const state = await api('');
    const needle = (keyword || '').trim().toLowerCase();
    if (!needle) return { hits: [] };
    const hits = allPages(state)
      .filter(({ document, page }) => {
        const text = page.textPreview.toLowerCase();
        const name = document.name.toLowerCase();
        const score = (text.split(needle).length - 1) * 2 + (name.includes(needle) ? 1 : 0);
        return score > 0;
      })
      .map(({ document, page }) => {
        const text = page.textPreview;
        const at = text.toLowerCase().indexOf(needle);
        const excerpt =
          at >= 0
            ? `${at > 40 ? '…' : ''}${text.slice(Math.max(0, at - 40), at + 120)}`
            : text.slice(0, 160);
        return {
          pageId: page.id,
          documentId: document.id,
          document: document.name,
          number: page.number,
          excerpt
        };
      })
      .slice(0, limit);
    return { keyword, count: hits.length, hits };
  },

  async pdf_create_node({ title, parentId, note, tone }) {
    const result = await api('/nodes', {
      method: 'POST',
      body: JSON.stringify({
        title,
        parentId: parentId || null,
        note: note || '',
        tone: tone || 'teal'
      })
    });
    return {
      nodeId: result.node.id,
      title: result.node.title,
      path: nodeLabel(result.state, result.node)
    };
  },

  async pdf_update_node({ id, title, parentId, note, tone }) {
    const payload = {};
    if (title !== undefined) payload.title = title;
    if (note !== undefined) payload.note = note;
    if (tone !== undefined) payload.tone = tone;
    if (parentId !== undefined) payload.parentId = parentId || null;
    const state = await api(`/nodes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    const node = state.nodes.find((item) => item.id === id);
    return { nodeId: id, path: node ? nodeLabel(state, node) : '' };
  },

  async pdf_delete_node({ id }) {
    await api(`/nodes/${id}`, { method: 'DELETE' });
    return { deleted: id };
  },

  async pdf_assign_pages({ nodeId, pageIds, action }) {
    const endpoint = action === 'remove' ? 'remove' : '';
    const state = await api(`/nodes/${nodeId}/pages${endpoint ? `/${endpoint}` : ''}`, {
      method: 'POST',
      body: JSON.stringify({ pageIds })
    });
    const node = state.nodes.find((item) => item.id === nodeId);
    return { nodeId, pageCount: node ? node.pages.length : 0, pages: node ? node.pages : [] };
  },

  async pdf_reorder_pages({ nodeId, pageIds }) {
    const state = await api(`/nodes/${nodeId}/pages`, {
      method: 'PATCH',
      body: JSON.stringify({ pageIds })
    });
    const node = state.nodes.find((item) => item.id === nodeId);
    return { nodeId, pages: node ? node.pages : [] };
  },

  async pdf_create_theme({ title, pageIds, note, coverPageId }) {
    const result = await api('/themes', {
      method: 'POST',
      body: JSON.stringify({
        title,
        pageIds,
        note: note || '',
        coverPageId: coverPageId || null
      })
    });
    return {
      themeId: result.theme.id,
      title: result.theme.title,
      pageCount: result.theme.pages.length,
      coverPageId: result.theme.coverPageId
    };
  },

  async pdf_list_themes() {
    const state = await api('');
    const index = new Map();
    for (const document of state.documents) {
      for (const page of document.pages) {
        index.set(page.id, { document: document.name, number: page.number });
      }
    }
    return {
      themes: state.themes.map((theme) => ({
        id: theme.id,
        title: theme.title,
        note: theme.note,
        createdAt: theme.createdAt,
        coverPageId: theme.coverPageId,
        pageCount: theme.pages.length,
        pages: theme.pages.map((pageId) => ({
          pageId,
          ...(index.get(pageId) || {})
        }))
      }))
    };
  },

  async pdf_update_theme({ id, title, note, coverPageId, pageIds }) {
    const payload = {};
    if (title !== undefined) payload.title = title;
    if (note !== undefined) payload.note = note;
    if (coverPageId !== undefined) payload.coverPageId = coverPageId || null;
    if (pageIds !== undefined) payload.pages = pageIds;
    const state = await api(`/themes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    const theme = state.themes.find((item) => item.id === id);
    return { themeId: id, title: theme?.title, pageCount: theme?.pages.length ?? 0 };
  },

  async pdf_delete_theme({ id }) {
    await api(`/themes/${id}`, { method: 'DELETE' });
    return { deleted: id };
  },

  async pdf_export({ scope, nodeId, themeId, pageIds, title, outputPath }) {
    const state = await api('');
    let body = { scope };
    let fallbackTitle = '知识树导出';

    if (scope === 'theme') {
      const theme = state.themes.find((item) => item.id === themeId);
      if (!theme) throw new Error('找不到这个主题');
      body = { scope: 'selection', pageIds: theme.pages, title: title || theme.title };
      fallbackTitle = theme.title;
    } else if (scope === 'selection') {
      body = { scope: 'selection', pageIds: pageIds || [], title: title || fallbackTitle };
    } else {
      const node = state.nodes.find((item) => item.id === nodeId);
      if (!node) throw new Error('找不到这个节点');
      body = { scope, nodeId, title: title || node.title };
      fallbackTitle = node.title;
    }

    const response = await fetch(API_BASE + '/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `导出失败 (${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const safeName = (fallbackTitle || '导出').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
    const target = outputPath
      ? path.resolve(outputPath)
      : path.join(EXPORT_DIR, `${safeName}-${nowIso().slice(0, 10)}.pdf`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
    return {
      file: target,
      sizeBytes: buffer.length,
      pageCount: Number(response.headers.get('X-Page-Count')) || 0
    };
  }
};

/* ------------------------------------------------------------------ */
/* MCP 装配                                                            */
/* ------------------------------------------------------------------ */

const server = new Server(
  { name: 'pdf-knowledge-tree', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const handler = handlers[request.params.name];
  if (!handler) {
    return {
      isError: true,
      content: [{ type: 'text', text: `未知工具：${request.params.name}` }]
    };
  }
  try {
    const result = await handler(request.params.arguments || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('工具出错：', message);
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
});

await server.connect(new StdioServerTransport());
log('MCP 服务已就绪');
