import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type Response } from 'express';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  PdfCategory,
  PdfCourse,
  PdfDocumentRecord,
  PdfNodeTone,
  PdfStudioState,
  PdfThemeRecord,
  PdfTreeNode
} from '../src/types';
import { dataDir } from './paths';

const libraryRoot = path.join(dataDir, 'pdf-library');
const filesRoot = path.join(libraryRoot, 'files');
const libraryPath = path.join(libraryRoot, 'library.json');
const tones: PdfNodeTone[] = ['brick', 'teal', 'gold', 'ink'];

interface StoredState {
  workspaceName: string;
  documents: PdfDocumentRecord[];
  nodes: PdfTreeNode[];
  themes: PdfThemeRecord[];
  categories: PdfCategory[];
  courses: PdfCourse[];
  updatedAt: string;
}

const now = () => new Date().toISOString();
const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

const ensureFolders = () => {
  fs.mkdirSync(filesRoot, { recursive: true });
};

const seedNodes = (): PdfTreeNode[] => {
  const createdAt = now();
  const rootId = 'pdf-root-ai';
  const sections = [
    ['pdf-node-cognition', '认知', 'brick'],
    ['pdf-node-knowledge', '知识', 'teal'],
    ['pdf-node-technology', '技术', 'gold'],
    ['pdf-node-practice', '实践', 'ink'],
    ['pdf-node-industry', '行业', 'brick']
  ] as const;
  return [
    {
      id: rootId,
      parentId: null,
      title: 'AI',
      note: '领域根节点',
      tone: 'ink',
      order: 0,
      pages: [],
      createdAt,
      updatedAt: createdAt
    },
    ...sections.map(([id, title, tone], index) => ({
      id,
      parentId: rootId,
      title,
      note: '',
      tone,
      order: index,
      pages: [],
      createdAt,
      updatedAt: createdAt
    }))
  ];
};

const seedState = (): StoredState => ({
  workspaceName: 'AI 知识树',
  documents: [],
  nodes: seedNodes(),
  themes: [],
  categories: seedCategories(),
  courses: [],
  updatedAt: now()
});

const seedCategories = (): PdfCategory[] => {
  const createdAt = now();
  return [
    { id: 'pdf-cat-handout', name: '讲义', tone: 'teal', order: 0, createdAt },
    { id: 'pdf-cat-paper', name: '论文', tone: 'gold', order: 1, createdAt },
    { id: 'pdf-cat-reference', name: '参考', tone: 'ink', order: 2, createdAt }
  ];
};

const normalizeState = (raw: Partial<StoredState> | null): StoredState => {
  const fallback = seedState();
  const documents = Array.isArray(raw?.documents)
    ? raw.documents.filter(
        (item): item is PdfDocumentRecord =>
          Boolean(item?.id && item?.name && Array.isArray(item.pages))
      )
    : [];
  const storedNodes = Array.isArray(raw?.nodes)
    ? raw.nodes.filter(
        (item): item is PdfTreeNode =>
          Boolean(item?.id && item?.title && typeof item.order === 'number')
      )
    : [];
  const nodes = storedNodes.length ? storedNodes : fallback.nodes;
  const themes = Array.isArray(raw?.themes)
    ? raw.themes.filter(
        (item): item is PdfThemeRecord =>
          Boolean(item?.id && item?.title && Array.isArray(item.pages))
      )
    : [];
  const categories = Array.isArray(raw?.categories)
    ? raw.categories.filter(
        (item): item is PdfCategory =>
          Boolean(item?.id && item?.name && typeof item.order === 'number')
      )
    : fallback.categories;
  const courses = Array.isArray(raw?.courses)
    ? raw.courses.filter(
        (item): item is PdfCourse =>
          Boolean(item?.id && item?.title && Array.isArray(item.lessons))
      )
    : [];
  return {
    workspaceName: raw?.workspaceName?.trim() || fallback.workspaceName,
    documents,
    nodes,
    themes,
    categories,
    courses,
    updatedAt: raw?.updatedAt || now()
  };
};

const readState = (): StoredState => {
  ensureFolders();
  if (!fs.existsSync(libraryPath)) {
    const seeded = seedState();
    writeState(seeded);
    return seeded;
  }
  try {
    return normalizeState(JSON.parse(fs.readFileSync(libraryPath, 'utf8')) as StoredState);
  } catch {
    const seeded = seedState();
    writeState(seeded);
    return seeded;
  }
};

const writeState = (state: StoredState) => {
  ensureFolders();
  state.updatedAt = now();
  fs.writeFileSync(libraryPath, JSON.stringify(state, null, 2), 'utf8');
  return state;
};

const publicState = (state = readState()): PdfStudioState => {
  const placedPages = state.nodes.reduce((sum, node) => sum + node.pages.length, 0);
  const pages = state.documents.reduce((sum, doc) => sum + doc.pages.length, 0);
  return {
    ...state,
    stats: {
      documents: state.documents.length,
      pages,
      nodes: state.nodes.length,
      placedPages,
      themes: state.themes.length,
      categories: state.categories.length,
      courses: state.courses.length
    }
  };
};

const sendState = (res: Response, state: StoredState) => {
  res.json(publicState(state));
};

const decodeFileName = (value: string | undefined) => {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const cleanFileName = (name: string) =>
  name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || '未命名文档.pdf';

const pageId = (documentId: string, pageNumber: number) => `${documentId}:${pageNumber}`;

const parsePageId = (value: string) => {
  const separator = value.lastIndexOf(':');
  if (separator < 1) return null;
  const documentId = value.slice(0, separator);
  const pageNumber = Number(value.slice(separator + 1));
  if (!documentId || !Number.isInteger(pageNumber) || pageNumber < 1) return null;
  return { documentId, pageNumber };
};

const validPageIds = (state: StoredState) => {
  const ids = new Set<string>();
  for (const document of state.documents) {
    for (const page of document.pages) ids.add(page.id);
  }
  return ids;
};

const cleanPreview = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, 320);

/**
 * Text extraction is a convenience for browsing and searching. Page geometry
 * comes from pdf-lib, so a PDF still imports even if its text layer is unusual.
 */
const extractPagePreviews = async (buffer: Buffer, pageCount: number) => {
  const previews = new Map<number, string>();
  try {
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true
    });
    const pdf = await loadingTask.promise;
    try {
      for (let index = 1; index <= pageCount; index += 1) {
        const page = await pdf.getPage(index);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        previews.set(index, cleanPreview(text));
        page.cleanup();
      }
    } finally {
      await loadingTask.destroy();
    }
  } catch (error) {
    console.warn(
      'PDF text extraction skipped:',
      error instanceof Error ? error.message : String(error)
    );
  }
  return previews;
};

const parsePdf = async (buffer: Buffer, id: string, name: string, fileName: string) => {
  const pdf = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false
  });
  const rawPages = pdf.getPages();
  const previews = await extractPagePreviews(buffer, rawPages.length);
  const document: PdfDocumentRecord = {
    id,
    name,
    fileName,
    sizeBytes: buffer.length,
    pageCount: rawPages.length,
    importedAt: now(),
    categoryId: null,
    pages: rawPages.map((page, index) => {
      const { width, height } = page.getSize();
      const number = index + 1;
      return {
        id: pageId(id, number),
        number,
        width,
        height,
        textPreview: previews.get(number) || ''
      };
    })
  };
  return document;
};

const descendantsOf = (nodes: PdfTreeNode[], nodeId: string) => {
  const result = new Set<string>();
  const visit = (parentId: string) => {
    for (const node of nodes) {
      if (node.parentId === parentId && !result.has(node.id)) {
        result.add(node.id);
        visit(node.id);
      }
    }
  };
  visit(nodeId);
  return result;
};

const isDescendant = (nodes: PdfTreeNode[], nodeId: string, maybeParentId: string) => {
  let cursor = nodes.find((node) => node.id === maybeParentId);
  const seen = new Set<string>();
  while (cursor?.parentId && !seen.has(cursor.parentId)) {
    if (cursor.parentId === nodeId) return true;
    seen.add(cursor.parentId);
    cursor = nodes.find((node) => node.id === cursor?.parentId);
  }
  return false;
};

const collectBranchPages = (
  nodes: PdfTreeNode[],
  nodeId: string,
  includeChildren = true
) => {
  const pages: string[] = [];
  const visit = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    pages.push(...node.pages);
    if (!includeChildren) return;
    nodes
      .filter((item) => item.parentId === id)
      .sort((a, b) => a.order - b.order)
      .forEach((child) => visit(child.id));
  };
  visit(nodeId);
  return pages;
};

const resolveExportPages = (
  state: StoredState,
  body: {
    scope?: 'node' | 'branch' | 'selection';
    nodeId?: string;
    pageIds?: string[];
  }
) => {
  const scope = body.scope || 'branch';
  if (scope === 'selection') {
    return Array.isArray(body.pageIds) ? body.pageIds : [];
  }
  if (!body.nodeId) throw new Error('请选择要导出的树节点');
  const node = state.nodes.find((item) => item.id === body.nodeId);
  if (!node) throw new Error('所选节点不存在');
  return collectBranchPages(state.nodes, node.id, scope === 'branch');
};

const safeDownloadName = (name: string) =>
  cleanFileName(name)
    .replace(/\.pdf$/i, '')
    .replace(/[^\p{L}\p{N}\-_\s]/gu, '')
    .trim()
    .slice(0, 72) || '页序导出';

export function mountPdfStudio(app: Express) {
  app.get('/api/pdf-studio', (_req, res) => {
    sendState(res, readState());
  });

  app.patch('/api/pdf-studio', (req, res) => {
    const state = readState();
    const workspaceName = String(req.body?.workspaceName || '').trim();
    if (workspaceName) state.workspaceName = workspaceName.slice(0, 80);
    writeState(state);
    sendState(res, state);
  });

  app.post(
    '/api/pdf-studio/documents',
    express.raw({ type: () => true, limit: '512mb' }),
    async (req, res) => {
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!buffer.length || buffer.subarray(0, 5).toString() !== '%PDF-') {
        res.status(400).json({ error: '请选择有效的 PDF 文件' });
        return;
      }
      const requestedName = cleanFileName(
        decodeFileName(String(req.headers['x-file-name'] || '')) || '未命名文档.pdf'
      );
      const name = requestedName.replace(/\.pdf$/i, '').trim() || '未命名文档';
      const id = makeId('pdf');
      const fileName = `${id}.pdf`;
      const target = path.join(filesRoot, fileName);
      ensureFolders();
      try {
        fs.writeFileSync(target, buffer);
        const document = await parsePdf(buffer, id, name, fileName);
        if (!document.pageCount) throw new Error('PDF 中没有可读取的页面');
        const state = readState();
        state.documents.unshift(document);
        writeState(state);
        res.status(201).json(publicState(state));
      } catch (error) {
        if (fs.existsSync(target)) fs.unlinkSync(target);
        res.status(400).json({
          error: error instanceof Error ? error.message : 'PDF 解析失败'
        });
      }
    }
  );

  app.patch('/api/pdf-studio/documents/:id', (req, res) => {
    const state = readState();
    const document = state.documents.find((item) => item.id === req.params.id);
    if (!document) {
      res.status(404).json({ error: '文档不存在' });
      return;
    }
    const name = String(req.body?.name || '').trim();
    if (name) document.name = name.slice(0, 120);
    if (typeof req.body?.categoryId !== 'undefined') {
      const categoryId = req.body.categoryId ? String(req.body.categoryId) : null;
      if (categoryId && !state.categories.some((item) => item.id === categoryId)) {
        res.status(400).json({ error: '分类不存在' });
        return;
      }
      document.categoryId = categoryId;
    }
    writeState(state);
    sendState(res, state);
  });

  app.delete('/api/pdf-studio/documents/:id', (req, res) => {
    const state = readState();
    const document = state.documents.find((item) => item.id === req.params.id);
    if (!document) {
      res.status(404).json({ error: '文档不存在' });
      return;
    }
    const removedIds = new Set(document.pages.map((page) => page.id));
    state.documents = state.documents.filter((item) => item.id !== document.id);
    state.nodes = state.nodes.map((node) => ({
      ...node,
      pages: node.pages.filter((id) => !removedIds.has(id))
    }));
    const filePath = path.join(filesRoot, document.fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // A stale file is preferable to losing the library state.
      }
    }
    writeState(state);
    sendState(res, state);
  });

  app.get('/api/pdf-studio/documents/:id/file', (req, res) => {
    const state = readState();
    const document = state.documents.find((item) => item.id === req.params.id);
    if (!document) {
      res.status(404).json({ error: '文档不存在' });
      return;
    }
    const filePath = path.join(filesRoot, document.fileName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'PDF 文件已丢失' });
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (req.query.download === '1') {
      res.download(filePath, `${document.name}.pdf`);
      return;
    }
    res.sendFile(filePath);
  });

  app.post('/api/pdf-studio/nodes', (req, res) => {
    const state = readState();
    const title = String(req.body?.title || '').trim();
    if (!title) {
      res.status(400).json({ error: '请填写节点名称' });
      return;
    }
    const parentId = req.body?.parentId ? String(req.body.parentId) : null;
    if (parentId && !state.nodes.some((node) => node.id === parentId)) {
      res.status(400).json({ error: '父节点不存在' });
      return;
    }
    const siblings = state.nodes.filter((node) => node.parentId === parentId);
    const tone = tones.includes(req.body?.tone) ? (req.body.tone as PdfNodeTone) : 'teal';
    const createdAt = now();
    const node: PdfTreeNode = {
      id: makeId('pdf-node'),
      parentId,
      title: title.slice(0, 40),
      note: String(req.body?.note || '').trim().slice(0, 240),
      tone,
      order: siblings.length
        ? Math.max(...siblings.map((item) => item.order)) + 1
        : 0,
      pages: [],
      createdAt,
      updatedAt: createdAt
    };
    state.nodes.push(node);
    writeState(state);
    res.status(201).json({ state: publicState(state), node });
  });

  app.patch('/api/pdf-studio/nodes/:id', (req, res) => {
    const state = readState();
    const node = state.nodes.find((item) => item.id === req.params.id);
    if (!node) {
      res.status(404).json({ error: '节点不存在' });
      return;
    }
    const title = String(req.body?.title || '').trim();
    if (title) node.title = title.slice(0, 40);
    if (typeof req.body?.note === 'string') node.note = req.body.note.trim().slice(0, 240);
    if (tones.includes(req.body?.tone)) node.tone = req.body.tone as PdfNodeTone;
    if (typeof req.body?.parentId !== 'undefined') {
      const nextParent = req.body.parentId ? String(req.body.parentId) : null;
      if (nextParent === node.id) {
        res.status(400).json({ error: '节点不能成为自己的上级' });
        return;
      }
      if (nextParent && !state.nodes.some((item) => item.id === nextParent)) {
        res.status(400).json({ error: '目标父节点不存在' });
        return;
      }
      if (nextParent && isDescendant(state.nodes, node.id, nextParent)) {
        res.status(400).json({ error: '不能把节点移动到它的子节点下' });
        return;
      }
      const previousParentId = node.parentId;
      node.parentId = nextParent;
      if (nextParent !== previousParentId) {
        const siblings = state.nodes.filter(
          (item) => item.id !== node.id && item.parentId === nextParent
        );
        node.order = siblings.length
          ? Math.max(...siblings.map((item) => item.order)) + 1
          : 0;
      }
    }
    if (Number.isFinite(Number(req.body?.order))) node.order = Number(req.body.order);
    node.updatedAt = now();
    writeState(state);
    sendState(res, state);
  });

  app.delete('/api/pdf-studio/nodes/:id', (req, res) => {
    const state = readState();
    const node = state.nodes.find((item) => item.id === req.params.id);
    if (!node) {
      res.status(404).json({ error: '节点不存在' });
      return;
    }
    const removed = new Set([node.id, ...descendantsOf(state.nodes, node.id)]);
    state.nodes = state.nodes.filter((item) => !removed.has(item.id));
    writeState(state);
    sendState(res, state);
  });

  app.post('/api/pdf-studio/nodes/:id/pages', (req, res) => {
    const state = readState();
    const node = state.nodes.find((item) => item.id === req.params.id);
    if (!node) {
      res.status(404).json({ error: '节点不存在' });
      return;
    }
    const valid = validPageIds(state);
    const incoming = Array.isArray(req.body?.pageIds)
      ? req.body.pageIds
          .map((item: unknown) => String(item))
          .filter((item: string) => valid.has(item) && !node.pages.includes(item))
      : [];
    const unique = [...new Set(incoming)] as string[];
    const requestedIndex = Number(req.body?.index);
    const insertAt = Number.isInteger(requestedIndex)
      ? Math.min(Math.max(requestedIndex, 0), node.pages.length)
      : node.pages.length;
    node.pages.splice(insertAt, 0, ...unique);
    node.updatedAt = now();
    writeState(state);
    sendState(res, state);
  });

  app.post('/api/pdf-studio/nodes/:id/pages/remove', (req, res) => {
    const state = readState();
    const node = state.nodes.find((item) => item.id === req.params.id);
    if (!node) {
      res.status(404).json({ error: '节点不存在' });
      return;
    }
    const removed = new Set(
      Array.isArray(req.body?.pageIds) ? req.body.pageIds.map((item: unknown) => String(item)) : []
    );
    node.pages = node.pages.filter((id) => !removed.has(id));
    node.updatedAt = now();
    writeState(state);
    sendState(res, state);
  });

  app.patch('/api/pdf-studio/nodes/:id/pages', (req, res) => {
    const state = readState();
    const node = state.nodes.find((item) => item.id === req.params.id);
    if (!node) {
      res.status(404).json({ error: '节点不存在' });
      return;
    }
    const valid = validPageIds(state);
    const requested = Array.isArray(req.body?.pageIds)
      ? req.body.pageIds.map((item: unknown) => String(item))
      : [];
    if (
      requested.length !== node.pages.length ||
      new Set(requested).size !== requested.length ||
      requested.some((id: string) => !valid.has(id) || !node.pages.includes(id))
    ) {
      res.status(400).json({ error: '排序结果不完整，请刷新后重试' });
      return;
    }
    node.pages = requested;
    node.updatedAt = now();
    writeState(state);
    sendState(res, state);
  });

  app.post('/api/pdf-studio/export', async (req, res) => {
    const state = readState();
    if (req.body?.scope === 'course') {
      const course = state.courses.find((item) => item.id === req.body?.courseId);
      if (!course) {
        res.status(404).json({ error: '课程不存在' });
        return;
      }
      const valid = validPageIds(state);
      const pageIds = course.lessons.flatMap((lesson) => {
        const from = Math.max(1, lesson.pageFrom);
        const to = Math.max(from, lesson.pageTo);
        const pages: string[] = [];
        for (let page = from; page <= to; page += 1) {
          const id = `${lesson.documentId}:${page}`;
          if (valid.has(id)) pages.push(id);
        }
        return pages;
      });
      if (!pageIds.length) {
        res.status(400).json({ error: '这门课还没有可导出的页面' });
        return;
      }
      req.body = { ...req.body, scope: 'selection', pageIds, title: req.body?.title || course.title };
    }
    const scope =
      req.body?.scope === 'node' || req.body?.scope === 'selection'
        ? req.body.scope
        : 'branch';
    const requested = resolveExportPages(state, {
      scope,
      nodeId: req.body?.nodeId ? String(req.body.nodeId) : undefined,
      pageIds: Array.isArray(req.body?.pageIds)
        ? req.body.pageIds.map((item: unknown) => String(item))
        : undefined
    });
    const valid = validPageIds(state);
    const pageIds = requested.filter((id) => valid.has(id));
    if (!pageIds.length) {
      res.status(400).json({ error: '当前选择还没有可导出的页面' });
      return;
    }

    try {
      const output = await PDFDocument.create();
      const sources = new Map<string, PDFDocument | null>();
      for (const id of pageIds) {
        const parsed = parsePageId(id);
        if (!parsed) continue;
        let source = sources.get(parsed.documentId);
        if (source === undefined) {
          const document = state.documents.find((item) => item.id === parsed.documentId);
          const filePath = document ? path.join(filesRoot, document.fileName) : '';
          source =
            document && filePath && fs.existsSync(filePath)
              ? await PDFDocument.load(fs.readFileSync(filePath), {
                  ignoreEncryption: true,
                  updateMetadata: false
                })
              : null;
          sources.set(parsed.documentId, source);
        }
        if (!source) continue;
        const index = parsed.pageNumber - 1;
        if (index < 0 || index >= source.getPageCount()) continue;
        const [copied] = await output.copyPages(source, [index]);
        output.addPage(copied);
      }
      if (!output.getPageCount()) {
        res.status(400).json({ error: '没有找到可读取的页面，请重新导入原 PDF' });
        return;
      }

      const node = state.nodes.find((item) => item.id === req.body?.nodeId);
      const titleOverride = String(req.body?.title || '').trim();
      const label =
        titleOverride ||
        (scope === 'selection'
          ? '页面选辑'
          : node?.title || state.workspaceName || '页序导出');
      const fileName = `${safeDownloadName(label)}-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      output.setProducer('KeXu PDF Studio');
      output.setCreationDate(new Date());
      const bytes = await output.save();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="export.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`
      );
      res.setHeader('X-Page-Count', String(output.getPageCount()));
      res.send(Buffer.from(bytes));
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'PDF 组合导出失败'
      });
    }
  });

  app.post('/api/pdf-studio/themes', (req, res) => {
    const state = readState();
    const title = String(req.body?.title || '').trim();
    if (!title) {
      res.status(400).json({ error: '请填写主题名称' });
      return;
    }
    const valid = validPageIds(state);
    const requestedPages = req.body?.pages ?? req.body?.pageIds;
    const pages = Array.isArray(requestedPages)
      ? requestedPages
          .map((item: unknown) => String(item))
          .filter((item: string) => valid.has(item))
      : [];
    if (!pages.length) {
      res.status(400).json({ error: '请先选择要组合的页面' });
      return;
    }
    const createdAt = now();
    const coverPageId =
      typeof req.body?.coverPageId === 'string' && pages.includes(req.body.coverPageId)
        ? req.body.coverPageId
        : pages[0];
    const theme: PdfThemeRecord = {
      id: makeId('pdf-theme'),
      title: title.slice(0, 60),
      note: String(req.body?.note || '').trim().slice(0, 240),
      coverPageId,
      pages,
      createdAt,
      updatedAt: createdAt
    };
    state.themes.unshift(theme);
    writeState(state);
    res.status(201).json({ state: publicState(state), theme });
  });

  app.post('/api/pdf-studio/categories', (req, res) => {
    const state = readState();
    const name = String(req.body?.name || '').trim();
    if (!name) {
      res.status(400).json({ error: '请填写分类名称' });
      return;
    }
    const createdAt = now();
    const category: PdfCategory = {
      id: makeId('pdf-cat'),
      name: name.slice(0, 30),
      tone: tones.includes(req.body?.tone) ? (req.body.tone as PdfNodeTone) : 'teal',
      order: state.categories.length
        ? Math.max(...state.categories.map((item) => item.order)) + 1
        : 0,
      createdAt
    };
    state.categories.push(category);
    writeState(state);
    res.status(201).json({ state: publicState(state), category });
  });

  app.patch('/api/pdf-studio/categories/:id', (req, res) => {
    const state = readState();
    const category = state.categories.find((item) => item.id === req.params.id);
    if (!category) {
      res.status(404).json({ error: '分类不存在' });
      return;
    }
    const name = String(req.body?.name || '').trim();
    if (name) category.name = name.slice(0, 30);
    if (tones.includes(req.body?.tone)) category.tone = req.body.tone as PdfNodeTone;
    if (Number.isFinite(Number(req.body?.order))) category.order = Number(req.body.order);
    writeState(state);
    sendState(res, state);
  });

  app.delete('/api/pdf-studio/categories/:id', (req, res) => {
    const state = readState();
    const category = state.categories.find((item) => item.id === req.params.id);
    if (!category) {
      res.status(404).json({ error: '分类不存在' });
      return;
    }
    state.categories = state.categories.filter((item) => item.id !== category.id);
    for (const document of state.documents) {
      if (document.categoryId === category.id) document.categoryId = null;
    }
    writeState(state);
    sendState(res, state);
  });

  app.post('/api/pdf-studio/courses', (req, res) => {
    const state = readState();
    const title = String(req.body?.title || '').trim();
    if (!title) {
      res.status(400).json({ error: '请填写课程名称' });
      return;
    }
    const lessons = Array.isArray(req.body?.lessons)
      ? req.body.lessons
          .filter((item: unknown) => item && typeof item === 'object')
          .map((item: Record<string, unknown>) => ({
            id: String(item.id || makeId('pdf-lesson')),
            title: String(item.title || '未命名课次').slice(0, 60),
            documentId: String(item.documentId || ''),
            pageFrom: Math.max(1, Number(item.pageFrom) || 1),
            pageTo: Math.max(1, Number(item.pageTo) || 1),
            note: String(item.note || '').slice(0, 240)
          }))
          .filter((item: { documentId: string }) => item.documentId)
      : [];
    if (!lessons.length) {
      res.status(400).json({ error: '课程里至少要有一课' });
      return;
    }
    const createdAt = now();
    const course: PdfCourse = {
      id: makeId('pdf-course'),
      title: title.slice(0, 60),
      note: String(req.body?.note || '').trim().slice(0, 240),
      lessons,
      createdAt,
      updatedAt: createdAt
    };
    state.courses.unshift(course);
    writeState(state);
    res.status(201).json({ state: publicState(state), course });
  });

  app.patch('/api/pdf-studio/courses/:id', (req, res) => {
    const state = readState();
    const course = state.courses.find((item) => item.id === req.params.id);
    if (!course) {
      res.status(404).json({ error: '课程不存在' });
      return;
    }
    const title = String(req.body?.title || '').trim();
    if (title) course.title = title.slice(0, 60);
    if (typeof req.body?.note === 'string') course.note = req.body.note.trim().slice(0, 240);
    if (Array.isArray(req.body?.lessons) && req.body.lessons.length) {
      course.lessons = req.body.lessons.map((item: Record<string, unknown>) => ({
        id: String(item.id || makeId('pdf-lesson')),
        title: String(item.title || '未命名课次').slice(0, 60),
        documentId: String(item.documentId || ''),
        pageFrom: Math.max(1, Number(item.pageFrom) || 1),
        pageTo: Math.max(1, Number(item.pageTo) || 1),
        note: String(item.note || '').slice(0, 240)
      }));
    }
    course.updatedAt = now();
    writeState(state);
    sendState(res, state);
  });

  app.delete('/api/pdf-studio/courses/:id', (req, res) => {
    const state = readState();
    const course = state.courses.find((item) => item.id === req.params.id);
    if (!course) {
      res.status(404).json({ error: '课程不存在' });
      return;
    }
    state.courses = state.courses.filter((item) => item.id !== course.id);
    writeState(state);
    sendState(res, state);
  });

  app.patch('/api/pdf-studio/themes/:id', (req, res) => {
    const state = readState();
    const theme = state.themes.find((item) => item.id === req.params.id);
    if (!theme) {
      res.status(404).json({ error: '主题不存在' });
      return;
    }
    const title = String(req.body?.title || '').trim();
    if (title) theme.title = title.slice(0, 60);
    if (typeof req.body?.note === 'string') theme.note = req.body.note.trim().slice(0, 240);
    const requestedPages = req.body?.pages ?? req.body?.pageIds;
    if (Array.isArray(requestedPages)) {
      const valid = validPageIds(state);
      const pages = requestedPages
        .map((item: unknown) => String(item))
        .filter((item: string) => valid.has(item));
      if (pages.length) theme.pages = pages;
    }
    if (
      typeof req.body?.coverPageId === 'string' &&
      theme.pages.includes(req.body.coverPageId)
    ) {
      theme.coverPageId = req.body.coverPageId;
    }
    theme.updatedAt = now();
    writeState(state);
    sendState(res, state);
  });

  app.delete('/api/pdf-studio/themes/:id', (req, res) => {
    const state = readState();
    const theme = state.themes.find((item) => item.id === req.params.id);
    if (!theme) {
      res.status(404).json({ error: '主题不存在' });
      return;
    }
    state.themes = state.themes.filter((item) => item.id !== theme.id);
    writeState(state);
    sendState(res, state);
  });
}
