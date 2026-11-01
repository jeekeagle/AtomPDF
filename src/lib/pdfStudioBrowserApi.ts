import { PDFDocument } from 'pdf-lib';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {
  PdfCategory,
  PdfCourse,
  PdfDocumentRecord,
  PdfExportScope,
  PdfLesson,
  PdfNodeTone,
  PdfStudioState,
  PdfThemeRecord,
  PdfTreeNode
} from '../types';
import {
  fitsUnderParent,
  isLegacySeedTree,
  migrateLegacyTree,
  nodeLevel,
  seedNodes,
  MAX_TREE_LEVEL
} from './pdfClassificationSeed';

GlobalWorkerOptions.workerSrc = workerUrl;

const DB_NAME = 'pdf-knowledge-atlas';
const DB_VERSION = 3;
const STORE_DOCS = 'documents';
const STORE_TREE = 'nodes';
const STORE_META = 'meta';
const STORE_THEMES = 'themes';
const STORE_CATEGORIES = 'categories';
const STORE_COURSES = 'courses';

interface StoredDocument extends PdfDocumentRecord {
  buffer: ArrayBuffer;
}

interface MetaRecord {
  key: string;
  value: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = () => {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_DOCS)) {
          db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_TREE)) {
          db.createObjectStore(STORE_TREE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_THEMES)) {
          db.createObjectStore(STORE_THEMES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
          db.createObjectStore(STORE_CATEGORIES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_COURSES)) {
          db.createObjectStore(STORE_COURSES, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
};

const requestValue = <T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
) =>
  openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = run(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );

const readAll = <T>(storeName: string) =>
  requestValue<T[]>(storeName, 'readonly', (store) => store.getAll());

const putRecord = (storeName: string, value: unknown) =>
  requestValue<IDBValidKey>(storeName, 'readwrite', (store) => store.put(value));

const deleteRecord = (storeName: string, key: string) =>
  requestValue<undefined>(storeName, 'readwrite', (store) => store.delete(key));

const now = () => new Date().toISOString();

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;

const seedCategories = (): PdfCategory[] => {
  const createdAt = now();
  return [
    { id: 'pdf-cat-handout', name: '讲义', tone: 'teal', order: 0, createdAt },
    { id: 'pdf-cat-paper', name: '论文', tone: 'gold', order: 1, createdAt },
    { id: 'pdf-cat-reference', name: '参考', tone: 'ink', order: 2, createdAt }
  ];
};

const publicState = async (): Promise<PdfStudioState> => {
  const [documents, nodes, meta, themes, categories, courses] = await Promise.all([
    readAll<StoredDocument>(STORE_DOCS),
    readTree(),
    readAll<MetaRecord>(STORE_META),
    readAll<PdfThemeRecord>(STORE_THEMES),
    readAll<PdfCategory>(STORE_CATEGORIES),
    readAll<PdfCourse>(STORE_COURSES)
  ]);
  const tree = nodes;
  const storedWorkspace = meta.find((item) => item.key === 'workspace')?.value?.trim();
  const workspaceName =
    storedWorkspace && storedWorkspace !== 'AI 知识树' ? storedWorkspace : 'AI 分类树';
  const categoryList = categories.length ? categories : seedCategories();
  if (!categories.length) {
    await Promise.all(categoryList.map((item) => putRecord(STORE_CATEGORIES, item)));
  }
  const visibleDocuments = documents
    .map((item) => {
      const copy = { ...item };
      delete (copy as Partial<StoredDocument>).buffer;
      return copy;
    })
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  const pages = visibleDocuments.reduce((sum, document) => sum + document.pages.length, 0);
  const placedPages = tree.reduce((sum, node) => sum + node.pages.length, 0);
  return {
    workspaceName,
    documents: visibleDocuments,
    nodes: tree,
    themes,
    categories: categoryList,
    courses,
    stats: {
      documents: visibleDocuments.length,
      pages,
      nodes: tree.length,
      placedPages,
      themes: themes.length,
      categories: categoryList.length,
      courses: courses.length
    },
    updatedAt: now()
  };
};

const extractText = async (buffer: ArrayBuffer, pageCount: number) => {
  const previews = new Map<number, string>();
  try {
    const task = getDocument({ data: new Uint8Array(buffer.slice(0)) });
    const pdf = await task.promise;
    for (let index = 1; index <= pageCount; index += 1) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 320);
      previews.set(index, text);
      page.cleanup();
    }
    await task.destroy();
  } catch {
    // A PDF without a usable text layer still imports as page images.
  }
  return previews;
};

const childrenOf = (nodes: PdfTreeNode[], parentId: string | null) =>
  nodes.filter((node) => node.parentId === parentId).sort((a, b) => a.order - b.order);

const isDescendant = (nodes: PdfTreeNode[], nodeId: string, candidateId: string) => {
  let cursor = nodes.find((node) => node.id === candidateId);
  const seen = new Set<string>();
  while (cursor?.parentId && !seen.has(cursor.parentId)) {
    if (cursor.parentId === nodeId) return true;
    seen.add(cursor.parentId);
    cursor = nodes.find((node) => node.id === cursor?.parentId);
  }
  return false;
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

const collectBranchPages = (nodes: PdfTreeNode[], nodeId: string) => {
  const pages: string[] = [];
  const visit = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    pages.push(...node.pages);
    childrenOf(nodes, id).forEach((child) => visit(child.id));
  };
  visit(nodeId);
  return pages;
};

const parsePageId = (value: string) => {
  const separator = value.lastIndexOf(':');
  if (separator < 1) return null;
  const documentId = value.slice(0, separator);
  const pageNumber = Number(value.slice(separator + 1));
  if (!documentId || !Number.isInteger(pageNumber) || pageNumber < 1) return null;
  return { documentId, pageNumber };
};

const saveNodes = async (nodes: PdfTreeNode[]) => {
  await Promise.all(nodes.map((node) => putRecord(STORE_TREE, node)));
};

const objectUrls = new Map<string, string>();

const blobUrlFor = async (id: string) => {
  const cached = objectUrls.get(id);
  if (cached) return cached;
  const documents = await readAll<StoredDocument>(STORE_DOCS);
  const document = documents.find((item) => item.id === id);
  if (!document) throw new Error('找不到这个 PDF');
  const url = URL.createObjectURL(
    new Blob([document.buffer], { type: 'application/pdf' })
  );
  objectUrls.set(id, url);
  return url;
};

const replaceNodes = async (nodes: PdfTreeNode[]) => {
  const existing = await readAll<PdfTreeNode>(STORE_TREE);
  const keep = new Set(nodes.map((node) => node.id));
  await Promise.all(
    existing
      .filter((node) => !keep.has(node.id))
      .map((node) => deleteRecord(STORE_TREE, node.id))
  );
  await saveNodes(nodes);
};

const readTree = async () => {
  const nodes = await readAll<PdfTreeNode>(STORE_TREE);
  if (!nodes.length) {
    const seeded = seedNodes();
    await saveNodes(seeded);
    return seeded;
  }
  if (isLegacySeedTree(nodes)) {
    const migrated = migrateLegacyTree(nodes);
    await replaceNodes(migrated);
    return migrated;
  }
  return nodes;
};

const readNodes = () => readTree();

export const browserApi = {
  state: () => publicState(),

  documentUrl: (id: string) => blobUrlFor(id),

  documentDownloadUrl: async (id: string) => blobUrlFor(id),

  downloadDocument: async (id: string) => {
    const documents = await readAll<StoredDocument>(STORE_DOCS);
    const document = documents.find((item) => item.id === id);
    if (!document) throw new Error('找不到这个文件');
    return {
      blob: new Blob([document.buffer], { type: 'application/pdf' }),
      fileName: `${document.name}.pdf`
    };
  },

  renameWorkspace: async (workspaceName: string) => {
    await putRecord(STORE_META, { key: 'workspace', value: workspaceName });
    return publicState();
  },

  uploadDocument: async (file: File) => {
    const buffer = await file.arrayBuffer();
    const parsed = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false
    });
    const rawPages = parsed.getPages();
    if (!rawPages.length) throw new Error('这个 PDF 里没有可读取的页面');
    const previews = await extractText(buffer, rawPages.length);
    const id = makeId('pdf');
    const document: StoredDocument = {
      id,
      name: file.name.replace(/\.pdf$/i, '').trim() || '未命名文档',
      fileName: `${id}.pdf`,
      sizeBytes: buffer.byteLength,
      pageCount: rawPages.length,
      importedAt: now(),
      categoryId: null,
      pages: rawPages.map((page, index) => {
        const { width, height } = page.getSize();
        const number = index + 1;
        return {
          id: `${id}:${number}`,
          number,
          width,
          height,
          textPreview: previews.get(number) || ''
        };
      }),
      buffer
    };
    await putRecord(STORE_DOCS, document);
    return publicState();
  },

  renameDocument: async (id: string, name: string, categoryId?: string | null) => {
    const documents = await readAll<StoredDocument>(STORE_DOCS);
    const document = documents.find((item) => item.id === id);
    if (document) {
      document.name = name;
      if (categoryId !== undefined) document.categoryId = categoryId;
      await putRecord(STORE_DOCS, document);
    }
    return publicState();
  },

  deleteDocument: async (id: string) => {
    const documents = await readAll<StoredDocument>(STORE_DOCS);
    const document = documents.find((item) => item.id === id);
    await deleteRecord(STORE_DOCS, id);
    const cached = objectUrls.get(id);
    if (cached) {
      URL.revokeObjectURL(cached);
      objectUrls.delete(id);
    }
    if (document) {
      const removed = new Set(document.pages.map((page) => page.id));
      const nodes = await readNodes();
      await saveNodes(
        nodes.map((node) => ({
          ...node,
          pages: node.pages.filter((pageId) => !removed.has(pageId))
        }))
      );
    }
    return publicState();
  },

  createNode: async (payload: {
    title: string;
    parentId: string | null;
    note?: string;
    tone?: PdfNodeTone;
  }) => {
    const nodes = await readNodes();
    if (payload.parentId && nodeLevel(nodes, payload.parentId) >= MAX_TREE_LEVEL) {
      throw new Error('分类树最多四级，这一层不能再加子节点');
    }
    const siblings = nodes.filter((node) => node.parentId === payload.parentId);
    const createdAt = now();
    const node: PdfTreeNode = {
      id: makeId('pdf-node'),
      parentId: payload.parentId,
      title: payload.title.slice(0, 40),
      note: (payload.note || '').slice(0, 240),
      tone: payload.tone || 'teal',
      order: siblings.length
        ? Math.max(...siblings.map((item) => item.order)) + 1
        : 0,
      pages: [],
      createdAt,
      updatedAt: createdAt
    };
    nodes.push(node);
    await saveNodes(nodes);
    return { state: await publicState(), node };
  },

  updateNode: async (
    id: string,
    payload: Partial<{
      title: string;
      parentId: string | null;
      note: string;
      tone: PdfNodeTone;
      order: number;
    }>
  ) => {
    const nodes = await readNodes();
    const node = nodes.find((item) => item.id === id);
    if (!node) throw new Error('节点不存在');
    if (payload.title) node.title = payload.title.slice(0, 40);
    if (typeof payload.note === 'string') node.note = payload.note.slice(0, 240);
    if (payload.tone) node.tone = payload.tone;
    if (typeof payload.parentId !== 'undefined') {
      const nextParent = payload.parentId;
      if (nextParent === node.id) throw new Error('节点不能成为自己的上级');
      if (nextParent && isDescendant(nodes, node.id, nextParent)) {
        throw new Error('不能把节点移动到它的子节点下');
      }
      if (nextParent && !fitsUnderParent(nodes, node.id, nextParent)) {
        throw new Error('分类树最多四级，这次移动会让层级超限');
      }
      if (nextParent !== node.parentId) {
        const siblings = nodes.filter(
          (item) => item.id !== node.id && item.parentId === nextParent
        );
        node.parentId = nextParent;
        node.order = siblings.length
          ? Math.max(...siblings.map((item) => item.order)) + 1
          : 0;
      }
    }
    node.updatedAt = now();
    await saveNodes(nodes);
    return publicState();
  },

  deleteNode: async (id: string) => {
    const nodes = await readNodes();
    const removed = new Set([id, ...descendantsOf(nodes, id)]);
    await saveNodes(nodes.filter((node) => !removed.has(node.id)));
    return publicState();
  },

  createTheme: async (payload: {
    title: string;
    note?: string;
    pages: string[];
    coverPageId?: string | null;
  }) => {
    const documents = await readAll<StoredDocument>(STORE_DOCS);
    const valid = new Set(
      documents.flatMap((document) => document.pages.map((page) => page.id))
    );
    const pages = payload.pages.filter((pageId) => valid.has(pageId));
    if (!pages.length) throw new Error('请先选择要组合的页面');
    const createdAt = now();
    const theme: PdfThemeRecord = {
      id: makeId('pdf-theme'),
      title: payload.title.trim().slice(0, 60) || '未命名主题',
      note: (payload.note || '').slice(0, 240),
      coverPageId:
        payload.coverPageId && pages.includes(payload.coverPageId)
          ? payload.coverPageId
          : pages[0],
      pages,
      createdAt,
      updatedAt: createdAt
    };
    const themes = await readAll<PdfThemeRecord>(STORE_THEMES);
    await putRecord(STORE_THEMES, theme);
    void themes;
    return { state: await publicState(), theme };
  },

  updateTheme: async (
    id: string,
    payload: Partial<{
      title: string;
      note: string;
      pages: string[];
      coverPageId: string | null;
    }>
  ) => {
    const themes = await readAll<PdfThemeRecord>(STORE_THEMES);
    const theme = themes.find((item) => item.id === id);
    if (!theme) throw new Error('主题不存在');
    if (payload.title) theme.title = payload.title.slice(0, 60);
    if (typeof payload.note === 'string') theme.note = payload.note.slice(0, 240);
    if (Array.isArray(payload.pages) && payload.pages.length) {
      theme.pages = payload.pages;
    }
    if (
      typeof payload.coverPageId === 'string' &&
      theme.pages.includes(payload.coverPageId)
    ) {
      theme.coverPageId = payload.coverPageId;
    }
    theme.updatedAt = now();
    await putRecord(STORE_THEMES, theme);
    return publicState();
  },

  deleteTheme: async (id: string) => {
    await deleteRecord(STORE_THEMES, id);
    return publicState();
  },

  createCategory: async (payload: { name: string; tone?: PdfNodeTone }) => {
    const categories = await readAll<PdfCategory>(STORE_CATEGORIES);
    const createdAt = now();
    const category: PdfCategory = {
      id: makeId('pdf-cat'),
      name: payload.name.trim().slice(0, 30) || '新分类',
      tone: payload.tone || 'teal',
      order: categories.length ? Math.max(...categories.map((item) => item.order)) + 1 : 0,
      createdAt
    };
    await putRecord(STORE_CATEGORIES, category);
    return { state: await publicState(), category };
  },

  updateCategory: async (
    id: string,
    payload: Partial<{ name: string; tone: PdfNodeTone; order: number }>
  ) => {
    const categories = await readAll<PdfCategory>(STORE_CATEGORIES);
    const category = categories.find((item) => item.id === id);
    if (!category) throw new Error('分类不存在');
    if (payload.name) category.name = payload.name.slice(0, 30);
    if (payload.tone) category.tone = payload.tone;
    if (typeof payload.order === 'number') category.order = payload.order;
    await putRecord(STORE_CATEGORIES, category);
    return publicState();
  },

  deleteCategory: async (id: string) => {
    await deleteRecord(STORE_CATEGORIES, id);
    const documents = await readAll<StoredDocument>(STORE_DOCS);
    await Promise.all(
      documents
        .filter((item) => item.categoryId === id)
        .map((item) => {
          const copy = { ...item, categoryId: null };
          return putRecord(STORE_DOCS, copy);
        })
    );
    return publicState();
  },

  createCourse: async (payload: {
    title: string;
    note?: string;
    lessons: PdfLesson[];
  }) => {
    if (!payload.lessons.length) throw new Error('课程里至少要有一课');
    const createdAt = now();
    const course: PdfCourse = {
      id: makeId('pdf-course'),
      title: payload.title.trim().slice(0, 60) || '未命名课程',
      note: (payload.note || '').slice(0, 240),
      lessons: payload.lessons.map((lesson) => ({
        id: lesson.id || makeId('pdf-lesson'),
        title: (lesson.title || '未命名课次').slice(0, 60),
        documentId: lesson.documentId,
        pageFrom: Math.max(1, lesson.pageFrom || 1),
        pageTo: Math.max(lesson.pageFrom || 1, lesson.pageTo || 1),
        note: (lesson.note || '').slice(0, 240)
      })),
      createdAt,
      updatedAt: createdAt
    };
    await putRecord(STORE_COURSES, course);
    return { state: await publicState(), course };
  },

  updateCourse: async (
    id: string,
    payload: Partial<{ title: string; note: string; lessons: PdfLesson[] }>
  ) => {
    const courses = await readAll<PdfCourse>(STORE_COURSES);
    const course = courses.find((item) => item.id === id);
    if (!course) throw new Error('课程不存在');
    if (payload.title) course.title = payload.title.slice(0, 60);
    if (typeof payload.note === 'string') course.note = payload.note.slice(0, 240);
    if (Array.isArray(payload.lessons) && payload.lessons.length) {
      course.lessons = payload.lessons.map((lesson) => ({
        id: lesson.id || makeId('pdf-lesson'),
        title: (lesson.title || '未命名课次').slice(0, 60),
        documentId: lesson.documentId,
        pageFrom: Math.max(1, lesson.pageFrom || 1),
        pageTo: Math.max(lesson.pageFrom || 1, lesson.pageTo || 1),
        note: (lesson.note || '').slice(0, 240)
      }));
    }
    course.updatedAt = now();
    await putRecord(STORE_COURSES, course);
    return publicState();
  },

  deleteCourse: async (id: string) => {
    await deleteRecord(STORE_COURSES, id);
    return publicState();
  },

  addPages: async (nodeId: string, pageIds: string[], index?: number) => {
    const nodes = await readNodes();
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) throw new Error('节点不存在');
    const documents = await readAll<StoredDocument>(STORE_DOCS);
    const valid = new Set(
      documents.flatMap((document) => document.pages.map((page) => page.id))
    );
    const incoming = pageIds.filter(
      (pageId) => valid.has(pageId) && !node.pages.includes(pageId)
    );
    const insertAt =
      typeof index === 'number' && Number.isInteger(index)
        ? Math.min(Math.max(index, 0), node.pages.length)
        : node.pages.length;
    node.pages.splice(insertAt, 0, ...new Set(incoming));
    node.updatedAt = now();
    await saveNodes(nodes);
    return publicState();
  },

  removePages: async (nodeId: string, pageIds: string[]) => {
    const nodes = await readNodes();
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) throw new Error('节点不存在');
    const removed = new Set(pageIds);
    node.pages = node.pages.filter((pageId) => !removed.has(pageId));
    node.updatedAt = now();
    await saveNodes(nodes);
    return publicState();
  },

  reorderPages: async (nodeId: string, pageIds: string[]) => {
    const nodes = await readNodes();
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) throw new Error('节点不存在');
    if (
      pageIds.length !== node.pages.length ||
      new Set(pageIds).size !== pageIds.length ||
      pageIds.some((pageId) => !node.pages.includes(pageId))
    ) {
      throw new Error('排序结果不完整，请刷新后重试');
    }
    node.pages = pageIds;
    node.updatedAt = now();
    await saveNodes(nodes);
    return publicState();
  },

  exportPdf: async (payload: {
    scope: PdfExportScope;
    nodeId?: string;
    pageIds?: string[];
    title?: string;
    courseId?: string;
  }) => {
    const nodes = await readNodes();
    let pageIds: string[] = [];
    if (payload.scope === 'course') {
      const courses = await readAll<PdfCourse>(STORE_COURSES);
      const course = courses.find((item) => item.id === payload.courseId);
      if (!course) throw new Error('课程不存在');
      const documents = await readAll<StoredDocument>(STORE_DOCS);
      const valid = new Set(
        documents.flatMap((document) => document.pages.map((page) => page.id))
      );
      pageIds = course.lessons.flatMap((lesson) => {
        const from = Math.max(1, lesson.pageFrom);
        const to = Math.max(from, lesson.pageTo);
        const pages: string[] = [];
        for (let page = from; page <= to; page += 1) {
          const id = `${lesson.documentId}:${page}`;
          if (valid.has(id)) pages.push(id);
        }
        return pages;
      });
    } else if (payload.scope === 'selection') {
      pageIds = payload.pageIds ? [...payload.pageIds] : [];
    } else if (payload.nodeId) {
      const node = nodes.find((item) => item.id === payload.nodeId);
      if (!node) throw new Error('找不到要导出的根节点');
      pageIds =
        payload.scope === 'branch' ? collectBranchPages(nodes, node.id) : [...node.pages];
    }
    if (!pageIds.length) throw new Error('当前选择还没有可导出的页面');

    const documents = await readAll<StoredDocument>(STORE_DOCS);
    const byId = new Map(documents.map((document) => [document.id, document]));
    const output = await PDFDocument.create();
    const sources = new Map<string, PDFDocument | null>();
    for (const pageId of pageIds) {
      const parsed = parsePageId(pageId);
      if (!parsed) continue;
      let source = sources.get(parsed.documentId);
      if (source === undefined) {
        const document = byId.get(parsed.documentId);
        source = document
          ? await PDFDocument.load(document.buffer, {
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
    if (!output.getPageCount()) throw new Error('没有找到可读取的页面，请重新导入 PDF');
    const node = nodes.find((item) => item.id === payload.nodeId);
    const courses = await readAll<PdfCourse>(STORE_COURSES);
    const course = courses.find((item) => item.id === payload.courseId);
    const label =
      payload.title?.trim() ||
      course?.title ||
      (payload.scope === 'selection' ? '页面选集' : node?.title || '分类树导出');
    const fileName = `${
      label.replace(/[^\p{L}\p{N}\-_\s]/gu, '').trim() || '分类树导出'
    }-${new Date().toISOString().slice(0, 10)}.pdf`;
    output.setProducer('PDF Knowledge Atlas');
    output.setCreationDate(new Date());
    const bytes = await output.save();
    return {
      blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      fileName,
      pageCount: output.getPageCount()
    };
  }
};
