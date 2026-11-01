import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode
} from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  FolderTree,
  GripVertical,
  LayoutGrid,
  Layers3,
  Layers,
  ListTree,
  LoaderCircle,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PenTool,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { PdfPageCanvas } from '../components/pdf/PdfPageCanvas';
import { Button, IconButton, Modal } from '../components/ui';
import {
  fitsUnderParent,
  nodeLevel,
  MAX_TREE_LEVEL
} from '../lib/pdfClassificationSeed';
import { pdfStudioApi } from '../lib/pdfStudioApi';
import type {
  PdfDocumentPage,
  PdfDocumentRecord,
  PdfExportScope,
  PdfNodeTone,
  PdfStudioState,
  PdfStudioTheme,
  PdfTreeNode
} from '../types';

interface PageHit {
  document: PdfDocumentRecord;
  page: PdfDocumentPage;
}

type MobilePane = 'tree' | 'library' | 'assembly';

interface NodeDraft {
  mode: 'create' | 'edit';
  nodeId?: string;
  parentId: string | null;
  title: string;
  note: string;
  tone: PdfNodeTone;
}

interface PdfStudioPageProps {
  onThemeCreated?: () => void;
  onOpenLibrary?: () => void;
}

interface ThemeDraft {
  pages: string[];
  title: string;
  note: string;
  coverPageId: string;
  sourceLabel: string;
}

const PAGE_DRAG_TYPE = 'application/x-pdf-studio-page';
const NODE_DRAG_TYPE = 'application/x-pdf-studio-node';

const toneLabel: Record<PdfNodeTone, string> = {
  brick: '砖红',
  teal: '青绿',
  gold: '赭金',
  ink: '墨色'
};

const themeOptions: Array<{
  id: PdfStudioTheme;
  label: string;
  title: string;
  icon: typeof ListTree;
}> = [
  { id: 'paper', label: '纸白', title: '纸白', icon: ListTree },
  { id: 'noir', label: '夜航', title: '夜航', icon: Network },
  { id: 'ink', label: '墨蓝', title: '墨蓝', icon: PenTool }
];

const exportOptions: Array<{
  id: PdfExportScope;
  label: string;
  detail: string;
}> = [
  { id: 'node', label: '当前节点', detail: '本节点页序' },
  { id: 'branch', label: '当前分支', detail: '含全部子级' },
  { id: 'selection', label: '手动选页', detail: '页面库中已选' }
];

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const pageLabel = (page: PdfDocumentPage) => String(page.number).padStart(2, '0');

const childrenOf = (nodes: PdfTreeNode[], parentId: string | null) =>
  nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.order - b.order);

const pathToNode = (nodes: PdfTreeNode[], nodeId: string) => {
  const path: PdfTreeNode[] = [];
  const seen = new Set<string>();
  let cursor = nodes.find((node) => node.id === nodeId);
  while (cursor && !seen.has(cursor.id)) {
    path.unshift(cursor);
    seen.add(cursor.id);
    cursor = cursor.parentId
      ? nodes.find((node) => node.id === cursor?.parentId)
      : undefined;
  }
  return path;
};

const isNodeDescendant = (nodes: PdfTreeNode[], nodeId: string, candidateId: string) => {
  let cursor = nodes.find((node) => node.id === candidateId);
  const seen = new Set<string>();
  while (cursor?.parentId && !seen.has(cursor.parentId)) {
    if (cursor.parentId === nodeId) return true;
    seen.add(cursor.parentId);
    cursor = nodes.find((node) => node.id === cursor?.parentId);
  }
  return false;
};

const collectBranchPageIds = (nodes: PdfTreeNode[], nodeId: string) => {
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

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const storedTheme = (): PdfStudioTheme => {
  const value = window.localStorage.getItem('pdf-studio-theme');
  return value === 'noir' || value === 'ink' ? value : 'paper';
};

const storedDrawer = (): 'inline' | 'drawer' => {
  if (typeof window === 'undefined') return 'inline';
  return window.localStorage.getItem('pdf-studio-tree-drawer') === 'drawer'
    ? 'drawer'
    : 'inline';
};

export function PdfStudioPage({ onThemeCreated, onOpenLibrary }: PdfStudioPageProps = {}) {
  const [studio, setStudio] = useState<PdfStudioState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState('all');
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState<PdfStudioTheme>(storedTheme);
  const [mobilePane, setMobilePane] = useState<MobilePane>('tree');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [dropNodeId, setDropNodeId] = useState('');
  const [dragNodeId, setDragNodeId] = useState('');
  const [dropStackIndex, setDropStackIndex] = useState<number | null>(null);
  const [nodeDraft, setNodeDraft] = useState<NodeDraft | null>(null);
  const [nodeSaving, setNodeSaving] = useState(false);
  const [nodeDraftError, setNodeDraftError] = useState('');
  const [previewPageId, setPreviewPageId] = useState('');
  const [workspaceEditing, setWorkspaceEditing] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [exportScope, setExportScope] = useState<PdfExportScope>('node');
  const [treeDrawer, setTreeDrawer] = useState<'inline' | 'drawer'>(storedDrawer);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [themeDraft, setThemeDraft] = useState<ThemeDraft | null>(null);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeDraftError, setThemeDraftError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const orderDragRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const next = await pdfStudioApi.state();
      setStudio(next);
      setWorkspaceName(next.workspaceName);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '分类树加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    window.localStorage.setItem('pdf-studio-theme', theme);
    const root = document.documentElement;
    root.classList.remove('theme-paper', 'theme-noir', 'theme-ink', 'dark');
    root.classList.add(`theme-${theme}`);
    if (theme === 'noir') root.classList.add('dark');
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('pdf-studio-tree-drawer', treeDrawer);
  }, [treeDrawer]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!studio) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      setExpanded(
        new Set(
          studio.nodes
            .filter((node) => node.parentId === null)
            .map((node) => node.id)
        )
      );
    }
    if (selectedNodeId && studio.nodes.some((node) => node.id === selectedNodeId)) return;
    const fallback =
      studio.nodes.find((node) => node.parentId === null) ?? studio.nodes[0];
    setSelectedNodeId(fallback?.id ?? '');
  }, [selectedNodeId, studio]);

  useEffect(() => {
    if (!studio) return;
    const validPages = new Set(
      studio.documents.flatMap((document) => document.pages.map((page) => page.id))
    );
    setSelectedPageIds((current) => {
      const next = current.filter((id) => validPages.has(id));
      return next.length === current.length ? current : next;
    });
    if (
      selectedDocumentId !== 'all' &&
      !studio.documents.some((document) => document.id === selectedDocumentId)
    ) {
      setSelectedDocumentId('all');
    }
  }, [selectedDocumentId, studio]);

  const selectedNode = useMemo(
    () => studio?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, studio?.nodes]
  );

  const pageIndex = useMemo(() => {
    const index = new Map<string, PageHit>();
    for (const document of studio?.documents ?? []) {
      for (const page of document.pages) index.set(page.id, { document, page });
    }
    return index;
  }, [studio?.documents]);

  const allPageHits = useMemo(() => {
    const hits: PageHit[] = [];
    for (const document of studio?.documents ?? []) {
      for (const page of document.pages) hits.push({ document, page });
    }
    return hits;
  }, [studio?.documents]);

  const filteredPages = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allPageHits.filter(({ document, page }) => {
      if (selectedDocumentId !== 'all' && document.id !== selectedDocumentId) return false;
      if (!needle) return true;
      return (
        document.name.toLowerCase().includes(needle) ||
        String(page.number).includes(needle) ||
        page.textPreview.toLowerCase().includes(needle)
      );
    });
  }, [allPageHits, query, selectedDocumentId]);

  const selectedDocument = studio?.documents.find(
    (document) => document.id === selectedDocumentId
  );
  const previewHit = previewPageId ? pageIndex.get(previewPageId) ?? null : null;
  const selectedPageSet = useMemo(() => new Set(selectedPageIds), [selectedPageIds]);
  const selectedPath = useMemo(
    () => (studio && selectedNode ? pathToNode(studio.nodes, selectedNode.id) : []),
    [selectedNode, studio]
  );
  const branchPageIds = useMemo(
    () =>
      studio && selectedNode
        ? collectBranchPageIds(studio.nodes, selectedNode.id)
        : [],
    [selectedNode, studio]
  );

  const setNodeExpanded = (nodeId: string, next: boolean) => {
    setExpanded((current) => {
      const copy = new Set(current);
      if (next) copy.add(nodeId);
      else copy.delete(nodeId);
      return copy;
    });
  };

  const expandAncestors = (nodeId: string) => {
    if (!studio) return;
    const ancestors = pathToNode(studio.nodes, nodeId).slice(0, -1).map((node) => node.id);
    setExpanded((current) => new Set([...current, ...ancestors]));
  };

  const chooseNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    expandAncestors(nodeId);
  };

  const openCreateNode = (parentId: string | null) => {
    const parent = parentId ? studio?.nodes.find((node) => node.id === parentId) : null;
    if (parentId && studio && nodeLevel(studio.nodes, parentId) >= MAX_TREE_LEVEL) {
      setToast({ kind: 'error', text: '分类树最多四级，这一层不能再加子节点' });
      return;
    }
    setNodeDraft({
      mode: 'create',
      parentId,
      title: '',
      note: '',
      tone: parent?.tone ?? 'teal'
    });
    setNodeDraftError('');
  };

  const openEditNode = (node: PdfTreeNode) => {
    setNodeDraft({
      mode: 'edit',
      nodeId: node.id,
      parentId: node.parentId,
      title: node.title,
      note: node.note,
      tone: node.tone
    });
    setNodeDraftError('');
  };

  const saveNodeDraft = async () => {
    if (!nodeDraft) return;
    const title = nodeDraft.title.trim();
    if (!title) {
      setNodeDraftError('节点名称不能为空');
      return;
    }
    if (
      studio &&
      nodeDraft.parentId &&
      !fitsUnderParent(studio.nodes, nodeDraft.nodeId ?? null, nodeDraft.parentId)
    ) {
      setNodeDraftError('分类树最多四级，换个上级或先调整子树层级');
      return;
    }
    setNodeSaving(true);
    setNodeDraftError('');
    try {
      if (nodeDraft.mode === 'create') {
        const result = await pdfStudioApi.createNode({
          title,
          parentId: nodeDraft.parentId,
          note: nodeDraft.note,
          tone: nodeDraft.tone
        });
        setStudio(result.state);
        if (nodeDraft.parentId) {
          setExpanded((current) => new Set([...current, nodeDraft.parentId as string]));
        }
        setSelectedNodeId(result.node.id);
        setToast({ kind: 'ok', text: `已创建“${result.node.title}”` });
      } else if (nodeDraft.nodeId) {
        const next = await pdfStudioApi.updateNode(nodeDraft.nodeId, {
          title,
          parentId: nodeDraft.parentId,
          note: nodeDraft.note,
          tone: nodeDraft.tone
        });
        setStudio(next);
        if (nodeDraft.parentId) {
          setExpanded((current) => new Set([...current, nodeDraft.parentId as string]));
        }
        setToast({ kind: 'ok', text: '节点已更新' });
      }
      setNodeDraft(null);
    } catch (error) {
      setNodeDraftError(error instanceof Error ? error.message : '节点保存失败');
    } finally {
      setNodeSaving(false);
    }
  };

  const deleteSelectedNode = async () => {
    if (!selectedNode || !studio) return;
    const confirmed = window.confirm(
      `删除“${selectedNode.title}”及其全部子节点？PDF 原文不会被删除。`
    );
    if (!confirmed) return;
    setBusy('删除节点');
    try {
      const next = await pdfStudioApi.deleteNode(selectedNode.id);
      setStudio(next);
      const fallback =
        next.nodes.find((node) => node.id === selectedNode.parentId) ??
        next.nodes.find((node) => node.parentId === null) ??
        next.nodes[0];
      setSelectedNodeId(fallback?.id ?? '');
      setToast({ kind: 'ok', text: '节点已删除' });
    } catch (error) {
      setToast({
        kind: 'error',
        text: error instanceof Error ? error.message : '节点删除失败'
      });
    } finally {
      setBusy('');
    }
  };

  const uploadFiles = async (files: File[]) => {
    const pdfFiles = files.filter(
      (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    );
    if (!pdfFiles.length) {
      setToast({ kind: 'error', text: '请选择 PDF 文件' });
      return;
    }
    let lastState: PdfStudioState | null = studio;
    const failures: string[] = [];
    for (let index = 0; index < pdfFiles.length; index += 1) {
      setBusy(`导入 ${index + 1}/${pdfFiles.length}`);
      try {
        lastState = await pdfStudioApi.uploadDocument(pdfFiles[index]);
      } catch (error) {
        failures.push(
          `${pdfFiles[index].name}：${error instanceof Error ? error.message : '导入失败'}`
        );
      }
    }
    if (lastState) {
      setStudio(lastState);
      setSelectedDocumentId(lastState.documents[0]?.id ?? 'all');
      setMobilePane('library');
    }
    setBusy('');
    if (failures.length) {
      setToast({ kind: 'error', text: failures.join('；') });
    } else {
      setToast({
        kind: 'ok',
        text: `已导入 ${pdfFiles.length} 份 PDF`
      });
    }
  };

  const handleFileDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    void uploadFiles(Array.from(event.dataTransfer.files));
  };

  const togglePage = (pageId: string) => {
    setSelectedPageIds((current) =>
      current.includes(pageId)
        ? current.filter((id) => id !== pageId)
        : [...current, pageId]
    );
  };

  const addPagesToNode = async (nodeId: string, pageIds: string[]) => {
    const unique = [...new Set(pageIds)].filter((id) => pageIndex.has(id));
    if (!unique.length) return;
    setBusy('归入节点');
    try {
      const next = await pdfStudioApi.addPages(nodeId, unique);
      setStudio(next);
      setSelectedNodeId(nodeId);
      setSelectedPageIds([]);
      if (studio) {
        const ancestors = pathToNode(studio.nodes, nodeId).map((node) => node.id);
        setExpanded((current) => new Set([...current, ...ancestors]));
      }
      setDropNodeId('');
      setMobilePane('assembly');
      setToast({ kind: 'ok', text: `已归入 ${unique.length} 页` });
    } catch (error) {
      setToast({
        kind: 'error',
        text: error instanceof Error ? error.message : '归页失败'
      });
    } finally {
      setBusy('');
    }
  };

  const removePageFromNode = async (pageId: string) => {
    if (!selectedNode) return;
    setBusy('移除页面');
    try {
      const next = await pdfStudioApi.removePages(selectedNode.id, [pageId]);
      setStudio(next);
    } catch (error) {
      setToast({
        kind: 'error',
        text: error instanceof Error ? error.message : '移除失败'
      });
    } finally {
      setBusy('');
    }
  };

  const reorderNodePages = async (from: number, to: number) => {
    if (!selectedNode || from === to || from < 0 || to < 0) return;
    const pages = [...selectedNode.pages];
    const [moved] = pages.splice(from, 1);
    if (!moved) return;
    pages.splice(to, 0, moved);
    setBusy('调整页序');
    setDropStackIndex(null);
    try {
      const next = await pdfStudioApi.reorderPages(selectedNode.id, pages);
      setStudio(next);
    } catch (error) {
      setToast({
        kind: 'error',
        text: error instanceof Error ? error.message : '页序调整失败'
      });
    } finally {
      orderDragRef.current = null;
      setBusy('');
    }
  };

  const movePageInNode = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (!selectedNode || target < 0 || target >= selectedNode.pages.length) return;
    void reorderNodePages(index, target);
  };

  const renameDocument = async () => {
    if (!selectedDocument) return;
    const nextName = window.prompt('重命名 PDF', selectedDocument.name)?.trim();
    if (!nextName || nextName === selectedDocument.name) return;
    setBusy('重命名文档');
    try {
      const next = await pdfStudioApi.renameDocument(selectedDocument.id, nextName);
      setStudio(next);
      setToast({ kind: 'ok', text: '文档名称已更新' });
    } catch (error) {
      setToast({
        kind: 'error',
        text: error instanceof Error ? error.message : '重命名失败'
      });
    } finally {
      setBusy('');
    }
  };

  const deleteDocument = async () => {
    if (!selectedDocument) return;
    const confirmed = window.confirm(
      `删除“${selectedDocument.name}”？所有节点中的这些页面也会被移除。`
    );
    if (!confirmed) return;
    setBusy('删除文档');
    try {
      const next = await pdfStudioApi.deleteDocument(selectedDocument.id);
      setStudio(next);
      setSelectedDocumentId(next.documents[0]?.id ?? 'all');
      setToast({ kind: 'ok', text: 'PDF 已删除' });
    } catch (error) {
      setToast({
        kind: 'error',
        text: error instanceof Error ? error.message : '删除失败'
      });
    } finally {
      setBusy('');
    }
  };

  const saveWorkspaceName = async () => {
    const nextName = workspaceName.trim();
    if (!studio || !nextName) {
      setWorkspaceName(studio?.workspaceName ?? '');
      setWorkspaceEditing(false);
      return;
    }
    setBusy('保存工作区');
    try {
      const next = await pdfStudioApi.renameWorkspace(nextName);
      setStudio(next);
      setWorkspaceName(next.workspaceName);
      setWorkspaceEditing(false);
    } catch (error) {
      setToast({
        kind: 'error',
        text: error instanceof Error ? error.message : '工作区改名失败'
      });
    } finally {
      setBusy('');
    }
  };

  const activeExportIds =
    exportScope === 'node'
      ? selectedNode?.pages ?? []
      : exportScope === 'branch'
        ? branchPageIds
        : selectedPageIds;

  const exportPdf = async () => {
    if (!activeExportIds.length) return;
    setBusy('生成 PDF');
    try {
      const result = await pdfStudioApi.exportPdf({
        scope: exportScope,
        nodeId: selectedNode?.id,
        pageIds: exportScope === 'selection' ? selectedPageIds : undefined
      });
      saveBlob(result.blob, result.fileName);
      setToast({
        kind: 'ok',
        text: `已导出 ${result.pageCount || result.blob.size ? result.pageCount : activeExportIds.length} 页`
      });
    } catch (error) {
      setToast({
        kind: 'error',
        text: error instanceof Error ? error.message : 'PDF 导出失败'
      });
    } finally {
      setBusy('');
    }
  };

  const moveNodeInto = async (nodeId: string, parentId: string) => {
    if (!studio) return;
    const node = studio.nodes.find((item) => item.id === nodeId);
    const parent = studio.nodes.find((item) => item.id === parentId);
    if (!node || !parent) return;
    if (isNodeDescendant(studio.nodes, nodeId, parentId)) {
      setToast({ kind: 'error', text: '不能把节点移到它自己的子节点下面' });
      return;
    }
    if (!fitsUnderParent(studio.nodes, nodeId, parentId)) {
      setToast({ kind: 'error', text: '分类树最多四级，这次移动会让层级超限' });
      return;
    }
    setBusy('调整分类树');
    try {
      const siblings = studio.nodes.filter(
        (item) => item.parentId === parentId && item.id !== nodeId
      );
      const next = await pdfStudioApi.updateNode(nodeId, {
        parentId,
        order: siblings.length
          ? Math.max(...siblings.map((item) => item.order)) + 1
          : 0
      });
      setStudio(next);
      setExpanded((current) => new Set([...current, parentId]));
      setToast({ kind: 'ok', text: `「${node.title}」已移到「${parent.title}」下` });
    } catch (moveError) {
      setToast({
        kind: 'error',
        text: moveError instanceof Error ? moveError.message : '移动节点失败'
      });
    } finally {
      setBusy('');
    }
  };

  const openComposeTheme = (pages: string[], sourceLabel: string) => {
    const unique = [...new Set(pages)].filter((id) => pageIndex.has(id));
    if (!unique.length) {
      setToast({ kind: 'error', text: '请先选择要组合的页面' });
      return;
    }
    setThemeDraft({
      pages: unique,
      title: sourceLabel ? `${sourceLabel} · 主题` : '未命名主题',
      note: '',
      coverPageId: unique[0],
      sourceLabel
    });
    setThemeDraftError('');
  };

  const removeThemePage = (pageId: string) => {
    setThemeDraft((current) => {
      if (!current) return current;
      const pages = current.pages.filter((id) => id !== pageId);
      return {
        ...current,
        pages,
        coverPageId:
          current.coverPageId === pageId ? pages[0] ?? '' : current.coverPageId
      };
    });
  };

  const saveThemeDraft = async () => {
    if (!themeDraft) return;
    const title = themeDraft.title.trim();
    if (!title) {
      setThemeDraftError('请填写主题名称');
      return;
    }
    if (!themeDraft.pages.length) {
      setThemeDraftError('一个主题里至少要有一页');
      return;
    }
    setThemeSaving(true);
    setThemeDraftError('');
    try {
      const result = await pdfStudioApi.createTheme({
        title,
        note: themeDraft.note,
        pages: themeDraft.pages,
        coverPageId: themeDraft.coverPageId
      });
      setStudio(result.state);
      setThemeDraft(null);
      setSelectedPageIds([]);
      setToast({ kind: 'ok', text: `「${title}」已存入主题库` });
      onThemeCreated?.();
    } catch (error) {
      setThemeDraftError(error instanceof Error ? error.message : '保存主题失败');
    } finally {
      setThemeSaving(false);
    }
  };

  const renderTreeNode = (node: PdfTreeNode, depth: number): ReactNode => {
    const children = childrenOf(studio?.nodes ?? [], node.id);
    const isExpanded = expanded.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const isDrop = dropNodeId === node.id;
    return (
      <div key={node.id} className="pdf-tree-branch" role="treeitem" aria-expanded={isExpanded}>
        <div
          className={`pdf-tree-row ${isSelected ? 'is-selected' : ''} ${isDrop ? 'is-drop' : ''}`}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(NODE_DRAG_TYPE)) {
              if (dragNodeId && dragNodeId !== node.id && !isNodeDescendant(studio?.nodes ?? [], dragNodeId, node.id)) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropNodeId(node.id);
              }
              return;
            }
            if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setDropNodeId(node.id);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDropNodeId((current) => (current === node.id ? '' : current));
            }
          }}
          onDrop={(event) => {
            if (event.dataTransfer.types.includes(NODE_DRAG_TYPE)) {
              event.preventDefault();
              event.stopPropagation();
              const sourceId = event.dataTransfer.getData(NODE_DRAG_TYPE);
              setDropNodeId('');
              if (sourceId && sourceId !== node.id) {
                void moveNodeInto(sourceId, node.id);
              }
              return;
            }
            if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
            event.preventDefault();
            event.stopPropagation();
            try {
              const pageIds = JSON.parse(
                event.dataTransfer.getData(PAGE_DRAG_TYPE)
              ) as string[];
              void addPagesToNode(node.id, pageIds);
            } catch {
              setDropNodeId('');
            }
          }}
        >
          <button
            className={`pdf-tree-toggle ${children.length ? '' : 'is-empty'}`}
            aria-label={isExpanded ? '收起节点' : '展开节点'}
            onClick={() => setNodeExpanded(node.id, !isExpanded)}
            tabIndex={children.length ? 0 : -1}
          >
            {children.length ? (
              isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
            ) : null}
          </button>
          <button
            className="pdf-tree-main"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(NODE_DRAG_TYPE, node.id);
              event.dataTransfer.effectAllowed = 'move';
              setDragNodeId(node.id);
            }}
            onDragEnd={() => {
              setDragNodeId('');
              setDropNodeId('');
            }}
            onClick={() => chooseNode(node.id)}
            title="拖到别的节点上可以改变层级"
          >
            <span className={`pdf-tone-dot is-${node.tone}`} />
            <span className="pdf-tree-copy">
              <strong>{node.title}</strong>
              {node.note && <small>{node.note}</small>}
            </span>
            <span className="pdf-tree-count">{node.pages.length}</span>
          </button>
          {depth + 1 < MAX_TREE_LEVEL && (
            <button
              className="pdf-tree-add"
              title="新增子节点"
              aria-label={`在${node.title}下新增子节点`}
              onClick={() => openCreateNode(node.id)}
            >
              <Plus size={13} />
            </button>
          )}
        </div>
        {children.length > 0 && isExpanded && (
          <div role="group">
            {children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`page pdf-studio-page pdf-studio-loading theme-${theme}`} data-pdf-theme={theme}>
        <LoaderCircle size={22} className="spin" />
        <span>正在打开 AtomPDF</span>
      </div>
    );
  }

  if (loadError || !studio) {
    return (
      <div className={`page pdf-studio-page pdf-studio-loading theme-${theme}`} data-pdf-theme={theme}>
        <AlertCircle size={22} />
        <strong>{loadError || 'AtomPDF 不可用'}</strong>
        <Button variant="secondary" size="sm" onClick={() => void refresh()}>
          重新加载
        </Button>
      </div>
    );
  }

  const rootNodes = childrenOf(studio.nodes, null);
  const stackNode = selectedNode;
  const stackPages = (stackNode?.pages ?? [])
    .map((id) => pageIndex.get(id))
    .filter((hit): hit is PageHit => Boolean(hit));
  const parentOptions = studio.nodes.filter((node) => {
    if (!nodeDraft) return false;
    if (nodeDraft.mode === 'create') {
      return nodeLevel(studio.nodes, node.id) < MAX_TREE_LEVEL;
    }
    if (!nodeDraft.nodeId || node.id === nodeDraft.nodeId) return false;
    if (isNodeDescendant(studio.nodes, nodeDraft.nodeId, node.id)) return false;
    return fitsUnderParent(studio.nodes, nodeDraft.nodeId, node.id);
  });

  return (
    <div className={`page pdf-studio-page theme-${theme}`} data-pdf-theme={theme}>
      <header className="pdf-studio-head">
        <div className="pdf-studio-title">
          <span className="eyebrow">PDF CLASSIFICATION ATLAS</span>
          <div className="pdf-title-line">
            {workspaceEditing ? (
              <>
                <input
                  className="pdf-title-input"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void saveWorkspaceName();
                    if (event.key === 'Escape') {
                      setWorkspaceName(studio.workspaceName);
                      setWorkspaceEditing(false);
                    }
                  }}
                  autoFocus
                />
                <IconButton label="保存名称" onClick={() => void saveWorkspaceName()}>
                  <Check size={16} />
                </IconButton>
                <IconButton
                  label="取消"
                  onClick={() => {
                    setWorkspaceName(studio.workspaceName);
                    setWorkspaceEditing(false);
                  }}
                >
                  <X size={16} />
                </IconButton>
              </>
            ) : (
              <>
                <h1>{studio.workspaceName}</h1>
                <IconButton
                  label="重命名工作区"
                  className="pdf-title-edit"
                  onClick={() => {
                    setWorkspaceName(studio.workspaceName);
                    setWorkspaceEditing(true);
                  }}
                >
                  <Pencil size={15} />
                </IconButton>
              </>
            )}
          </div>
        </div>
        <div className="pdf-head-side">
          <div className="pdf-stat-row" aria-label="工作区统计">
            <span>
              <FileText size={14} />
              <strong>{studio.stats.documents}</strong>
              文档
            </span>
            <span>
              <Layers3 size={14} />
              <strong>{studio.stats.pages}</strong>
              页面
            </span>
            <span>
              <FolderTree size={14} />
              <strong>{studio.stats.nodes}</strong>
              节点
            </span>
            <span>
              <BookOpen size={14} />
              <strong>{studio.stats.placedPages}</strong>
              已编排
            </span>
          </div>
          <div className="pdf-theme-switch" aria-label="视觉主题">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  className={theme === option.id ? 'is-active' : ''}
                  onClick={() => setTheme(option.id)}
                  title={option.title}
                  aria-label={option.title}
                  aria-pressed={theme === option.id}
                >
                  <Icon size={14} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="pdf-mobile-tabs" role="tablist" aria-label="工作台区域">
        {(
          [
            ['tree', '结构', FolderTree],
            ['library', '页面', LayoutGrid],
            ['assembly', '编排', Layers3]
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            className={mobilePane === id ? 'is-active' : ''}
            onClick={() => setMobilePane(id)}
            role="tab"
            aria-selected={mobilePane === id}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {treeDrawer === 'drawer' && !drawerOpen && (
        <button
          className="pdf-drawer-handle"
          onClick={() => setDrawerOpen(true)}
          title="展开目录"
          aria-label="展开目录"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      <div className={`pdf-workspace ${treeDrawer === 'drawer' ? 'is-drawer' : ''}`}>
        <section
          className={`pdf-pane pdf-tree-pane ${mobilePane === 'tree' ? 'is-mobile-active' : ''} ${
            treeDrawer === 'drawer' ? 'is-drawer' : ''
          } ${drawerOpen ? 'is-drawer-open' : ''}`}
        >
          <div className="pdf-pane-head">
            <div>
              <span className="eyebrow">STRUCTURE</span>
              <strong>分类树</strong>
            </div>
            <div className="pdf-pane-actions">
              <IconButton
                label="新增根节点"
                onClick={() => openCreateNode(null)}
                disabled={Boolean(busy)}
              >
                <Plus size={16} />
              </IconButton>
              <IconButton
                label="编辑当前节点"
                onClick={() => selectedNode && openEditNode(selectedNode)}
                disabled={!selectedNode || Boolean(busy)}
              >
                <Pencil size={15} />
              </IconButton>
              <IconButton
                label="删除当前节点"
                className="danger-hover"
                onClick={() => void deleteSelectedNode()}
                disabled={!selectedNode || Boolean(busy)}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
          </div>
          <div className="pdf-tree-scroll" role="tree" aria-label="PDF 分类树">
            {rootNodes.length ? (
              rootNodes.map((node) => renderTreeNode(node, 0))
            ) : (
              <button className="pdf-tree-empty" onClick={() => openCreateNode(null)}>
                <Plus size={17} />
                新建根节点
              </button>
            )}
          </div>
          <div className="pdf-tree-foot">
            <div className="pdf-tree-foot-info">
              <span>当前节点</span>
              <strong>{selectedNode?.title ?? '未选择'}</strong>
            </div>
            <span className="pdf-tree-foot-count">
              {selectedNode?.pages.length ?? 0} 页
            </span>
            <IconButton
              label="收起目录到抽屉"
              className="pdf-drawer-toggle"
              onClick={() => {
                setTreeDrawer('drawer');
                setDrawerOpen(false);
              }}
              disabled={Boolean(busy)}
            >
              <PanelLeftClose size={15} />
            </IconButton>
          </div>
        </section>

        <section
          className={`pdf-pane pdf-library-pane ${
            mobilePane === 'library' ? 'is-mobile-active' : ''
          }`}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) event.preventDefault();
          }}
          onDrop={handleFileDrop}
        >
          <div className="pdf-pane-head pdf-library-head">
            <div>
              <span className="eyebrow">PAGES</span>
              <strong>页面库</strong>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                void uploadFiles(files);
              }}
            />
            <div className="pdf-pane-actions">
              {treeDrawer === 'drawer' && (
                <IconButton label="打开目录抽屉" onClick={() => setDrawerOpen(true)}>
                  <PanelLeftOpen size={15} />
                </IconButton>
              )}
              <Button
                variant="primary"
                size="sm"
                icon={<Upload size={14} />}
                loading={busy.startsWith('导入')}
                onClick={() => fileInputRef.current?.click()}
              >
                导入 PDF
              </Button>
            </div>
          </div>

          <div className="pdf-doc-strip" role="tablist" aria-label="PDF 文档">
            <button
              className={`pdf-doc-chip ${selectedDocumentId === 'all' ? 'is-active' : ''}`}
              onClick={() => setSelectedDocumentId('all')}
            >
              <span className="pdf-doc-chip-icon">
                <LayoutGrid size={14} />
              </span>
              <span>
                <strong>全部页面</strong>
                <small>{studio.stats.pages} 页</small>
              </span>
            </button>
            {studio.documents.map((document) => (
              <button
                key={document.id}
                className={`pdf-doc-chip ${
                  selectedDocumentId === document.id ? 'is-active' : ''
                }`}
                onClick={() => setSelectedDocumentId(document.id)}
                title={`${document.name} · ${document.pageCount} 页`}
              >
                <span className="pdf-doc-chip-icon">
                  <FileText size={14} />
                </span>
                <span>
                  <strong>{document.name}</strong>
                  <small>
                    {document.pageCount} 页 · {formatBytes(document.sizeBytes)}
                  </small>
                </span>
              </button>
            ))}
          </div>

          <div className="pdf-library-tools">
            <label className="pdf-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索文件名、页码或页面文字"
              />
              {query && (
                <button aria-label="清空搜索" onClick={() => setQuery('')}>
                  <X size={13} />
                </button>
              )}
            </label>
            {selectedDocument && (
              <div className="pdf-doc-actions">
                <IconButton label="重命名 PDF" onClick={() => void renameDocument()}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton
                  label="删除 PDF"
                  className="danger-hover"
                  onClick={() => void deleteDocument()}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            )}
          </div>

          <div className="pdf-library-subbar">
            <span>
              {filteredPages.length} 页
              {query ? ` · 匹配“${query.trim()}”` : ''}
            </span>
            <div>
              <button
                className="pdf-text-action"
                onClick={() =>
                  setSelectedPageIds((current) => [
                    ...new Set([...current, ...filteredPages.map(({ page }) => page.id)])
                  ])
                }
                disabled={!filteredPages.length}
              >
                选择全部
              </button>
              <button
                className="pdf-text-action"
                onClick={() => setSelectedPageIds([])}
                disabled={!selectedPageIds.length}
              >
                清除选择
              </button>
            </div>
          </div>

          <div className="pdf-page-grid-wrap">
            {filteredPages.length ? (
              <div className="pdf-page-grid">
                {filteredPages.map(({ document, page }) => {
                  const selected = selectedPageSet.has(page.id);
                  return (
                    <article
                      key={page.id}
                      className={`pdf-page-tile ${selected ? 'is-selected' : ''}`}
                      role="checkbox"
                      aria-checked={selected}
                      aria-label={`${document.name} 第 ${page.number} 页`}
                      tabIndex={0}
                      draggable
                      onClick={() => togglePage(page.id)}
                      onDoubleClick={() => setPreviewPageId(page.id)}
                      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          togglePage(page.id);
                        }
                      }}
                      onDragStart={(event) => {
                        const ids =
                          selectedPageSet.has(page.id) && selectedPageIds.length
                            ? selectedPageIds
                            : [page.id];
                        event.dataTransfer.setData(PAGE_DRAG_TYPE, JSON.stringify(ids));
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                    >
                      <div className="pdf-page-thumb">
                        <PdfPageCanvas
                          documentId={document.id}
                          pageNumber={page.number}
                          width={page.width}
                          height={page.height}
                        />
                        <span className="pdf-page-number">{pageLabel(page)}</span>
                        <span className="pdf-page-check">
                          {selected ? <Check size={12} /> : null}
                        </span>
                        <button
                          className="pdf-page-eye"
                          title="预览页面"
                          aria-label={`预览第 ${page.number} 页`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPreviewPageId(page.id);
                          }}
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                      <div className="pdf-page-caption">
                        <div>
                          <strong>{document.name}</strong>
                          <small>第 {page.number} 页</small>
                        </div>
                        <p>{page.textPreview || '此页没有可检索的文字层'}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="pdf-library-empty">
                {studio.documents.length ? (
                  <>
                    <Search size={20} />
                    <strong>没有匹配的页面</strong>
                    <button className="pdf-text-action" onClick={() => setQuery('')}>
                      清除搜索
                    </button>
                  </>
                ) : (
                  <>
                    <FileText size={22} />
                    <strong>还没有 PDF</strong>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Upload size={14} />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      选择文件
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {selectedPageIds.length > 0 && (
            <div className="pdf-selection-bar">
              <span>
                <CheckCircle2 size={15} />
                已选 {selectedPageIds.length} 页
              </span>
              <div className="pdf-selection-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Layers size={14} />}
                  disabled={!selectedPageIds.length || Boolean(busy)}
                  onClick={() => openComposeTheme(selectedPageIds, '选页')}
                >
                  组合为主题
                </Button>
                <Button
                  variant="dark"
                  size="sm"
                  icon={<Plus size={14} />}
                  disabled={!selectedNode || Boolean(busy)}
                  onClick={() =>
                    selectedNode && void addPagesToNode(selectedNode.id, selectedPageIds)
                  }
                >
                  加入“{selectedNode?.title ?? '未选节点'}”
                </Button>
              </div>
            </div>
          )}
        </section>

        <section
          className={`pdf-pane pdf-assembly-pane ${
            mobilePane === 'assembly' ? 'is-mobile-active' : ''
          }`}
        >
          <div className="pdf-pane-head pdf-assembly-head">
            <div>
              <span className="eyebrow">ASSEMBLY</span>
              <strong>{selectedNode?.title ?? '选择一个节点'}</strong>
            </div>
            <span className="pdf-stack-total">{stackPages.length} 页</span>
          </div>

          <div className="pdf-node-path">
            {selectedPath.length ? (
              selectedPath.map((node, index) => (
                <span key={node.id}>
                  {index > 0 && <ChevronRight size={11} />}
                  <button onClick={() => chooseNode(node.id)}>{node.title}</button>
                </span>
              ))
            ) : (
              <span>未选择节点</span>
            )}
          </div>

          <div
            className="pdf-stack-scroll"
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(event) => {
              if (!event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
              event.preventDefault();
              if (!selectedNode) return;
              try {
                const ids = JSON.parse(
                  event.dataTransfer.getData(PAGE_DRAG_TYPE)
                ) as string[];
                void addPagesToNode(selectedNode.id, ids);
              } catch {
                setDropStackIndex(null);
              }
            }}
          >
            {stackPages.length ? (
              stackPages.map(({ document, page }, index) => (
                <div
                  key={page.id}
                  className={`pdf-stack-item ${
                    dropStackIndex === index ? 'is-drop' : ''
                  }`}
                  draggable
                  onDragStart={() => {
                    orderDragRef.current = index;
                  }}
                  onDragEnd={() => {
                    orderDragRef.current = null;
                    setDropStackIndex(null);
                  }}
                  onDragOver={(event) => {
                    if (orderDragRef.current === null) return;
                    event.preventDefault();
                    setDropStackIndex(index);
                  }}
                  onDragLeave={() =>
                    setDropStackIndex((current) => (current === index ? null : current))
                  }
                  onDrop={(event) => {
                    if (orderDragRef.current === null) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const from = orderDragRef.current;
                    orderDragRef.current = null;
                    void reorderNodePages(from, index);
                  }}
                >
                  <span className="pdf-stack-grip" aria-hidden="true">
                    <GripVertical size={14} />
                  </span>
                  <button
                    className="pdf-stack-thumb"
                    onClick={() => setPreviewPageId(page.id)}
                    title="预览页面"
                  >
                    <PdfPageCanvas
                      documentId={document.id}
                      pageNumber={page.number}
                      width={page.width}
                      height={page.height}
                    />
                  </button>
                  <div className="pdf-stack-copy">
                    <strong>{document.name}</strong>
                    <small>第 {page.number} 页</small>
                    <p>{page.textPreview || '无文字层'}</p>
                  </div>
                  <div className="pdf-stack-actions">
                    <IconButton
                      label="上移"
                      onClick={() => movePageInNode(index, -1)}
                      disabled={index === 0 || Boolean(busy)}
                    >
                      <ArrowUp size={13} />
                    </IconButton>
                    <IconButton
                      label="下移"
                      onClick={() => movePageInNode(index, 1)}
                      disabled={index === stackPages.length - 1 || Boolean(busy)}
                    >
                      <ArrowDown size={13} />
                    </IconButton>
                    <IconButton
                      label="移除页面"
                      className="danger-hover"
                      onClick={() => void removePageFromNode(page.id)}
                      disabled={Boolean(busy)}
                    >
                      <X size={13} />
                    </IconButton>
                  </div>
                </div>
              ))
            ) : (
              <div className="pdf-stack-empty">
                <Layers3 size={22} />
                <strong>这个节点还没有页面</strong>
                <span>拖入页面，或从页面库选择后加入</span>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<LayoutGrid size={14} />}
                  onClick={() => setMobilePane('library')}
                >
                  打开页面库
                </Button>
              </div>
            )}
          </div>

          <div className="pdf-export-box">
            <div className="pdf-export-head">
              <div>
                <span className="eyebrow">EXPORT</span>
                <strong>组合导出</strong>
              </div>
              <span className="pdf-export-count">{activeExportIds.length} 页</span>
            </div>
            <div className="pdf-scope-switch" role="group" aria-label="导出范围">
              {exportOptions.map((option) => (
                <button
                  key={option.id}
                  className={exportScope === option.id ? 'is-active' : ''}
                  onClick={() => setExportScope(option.id)}
                  aria-pressed={exportScope === option.id}
                >
                  <span>{option.label}</span>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>
            <Button
              variant="primary"
              size="md"
              icon={<Download size={15} />}
              loading={busy === '生成 PDF'}
              disabled={!activeExportIds.length || Boolean(busy)}
              onClick={() => void exportPdf()}
            >
              导出 PDF
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={<Layers size={15} />}
              disabled={!activeExportIds.length || Boolean(busy)}
              onClick={() =>
                openComposeTheme(activeExportIds, selectedNode?.title ?? '组合')
              }
            >
              组合为主题
            </Button>
          </div>
        </section>
      </div>

      {treeDrawer === 'drawer' && drawerOpen && (
        <button
          className="pdf-drawer-scrim"
          aria-label="关闭目录抽屉"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <Modal
        open={Boolean(nodeDraft)}
        title={nodeDraft?.mode === 'create' ? '新增分类节点' : '编辑分类节点'}
        description={
          nodeDraft?.mode === 'create'
            ? '新节点会出现在所选上级之下，分类树最多四级。'
            : '可修改名称、说明、层级和标记色，最多四级。'
        }
        onClose={() => !nodeSaving && setNodeDraft(null)}
      >
        {nodeDraft && (
          <div className="pdf-node-form">
            <label className="pdf-field">
              <span>节点名称</span>
              <input
                value={nodeDraft.title}
                onChange={(event) =>
                  setNodeDraft({ ...nodeDraft, title: event.target.value })
                }
                placeholder="例如：提示工程"
                maxLength={40}
                autoFocus
              />
            </label>
            <label className="pdf-field">
              <span>上级节点</span>
              <select
                value={nodeDraft.parentId ?? ''}
                onChange={(event) =>
                  setNodeDraft({
                    ...nodeDraft,
                    parentId: event.target.value || null
                  })
                }
              >
                <option value="">无上级，作为根节点</option>
                {parentOptions.map((node) => (
                  <option value={node.id} key={node.id}>
                    {pathToNode(studio.nodes, node.id)
                      .map((item) => item.title)
                      .join(' / ')}
                  </option>
                ))}
              </select>
            </label>
            <div className="pdf-field">
              <span>标记色</span>
              <div className="pdf-tone-options">
                {(Object.keys(toneLabel) as PdfNodeTone[]).map((tone) => (
                  <button
                    key={tone}
                    className={nodeDraft.tone === tone ? 'is-active' : ''}
                    onClick={() => setNodeDraft({ ...nodeDraft, tone })}
                  >
                    <span className={`pdf-tone-swatch is-${tone}`} />
                    {toneLabel[tone]}
                  </button>
                ))}
              </div>
            </div>
            <label className="pdf-field">
              <span>节点说明</span>
              <textarea
                value={nodeDraft.note}
                onChange={(event) =>
                  setNodeDraft({ ...nodeDraft, note: event.target.value })
                }
                placeholder="可选，用于说明这个节点收纳什么内容"
                rows={3}
                maxLength={240}
              />
            </label>
            {nodeDraftError && <p className="pdf-form-error">{nodeDraftError}</p>}
            <div className="pdf-form-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNodeDraft(null)}
                disabled={nodeSaving}
              >
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={nodeSaving}
                onClick={() => void saveNodeDraft()}
              >
                保存
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(themeDraft)}
        title="组合成主题"
        description="把挑好的页面组成一个主题，存进主题库，之后随时能再导成 PDF。"
        onClose={() => !themeSaving && setThemeDraft(null)}
      >
        {themeDraft && (
          <div className="pdf-theme-form">
            <label className="pdf-field">
              <span>主题名称</span>
              <input
                value={themeDraft.title}
                onChange={(event) =>
                  setThemeDraft({ ...themeDraft, title: event.target.value })
                }
                maxLength={60}
                autoFocus
              />
            </label>
            <label className="pdf-field">
              <span>主题说明</span>
              <textarea
                value={themeDraft.note}
                onChange={(event) =>
                  setThemeDraft({ ...themeDraft, note: event.target.value })
                }
                rows={2}
                maxLength={240}
                placeholder="这套材料讲的是…"
              />
            </label>
            <div className="pdf-field">
              <span>封面 · 共 {themeDraft.pages.length} 页</span>
              <div className="pdf-theme-cover-grid">
                {themeDraft.pages.map((pageId) => {
                  const hit = pageIndex.get(pageId);
                  if (!hit) return null;
                  return (
                    <button
                      key={pageId}
                      className={`pdf-theme-cover ${
                        themeDraft.coverPageId === pageId ? 'is-active' : ''
                      }`}
                      onClick={() =>
                        setThemeDraft({ ...themeDraft, coverPageId: pageId })
                      }
                    >
                      <span className="pdf-theme-cover-thumb">
                        <PdfPageCanvas
                          documentId={hit.document.id}
                          pageNumber={hit.page.number}
                          width={hit.page.width}
                          height={hit.page.height}
                        />
                      </span>
                      <span className="pdf-theme-cover-label">
                        {hit.document.name} · 第 {hit.page.number} 页
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="pdf-field">
              <span>页序</span>
              <div className="pdf-theme-page-list">
                {themeDraft.pages.map((pageId, index) => {
                  const hit = pageIndex.get(pageId);
                  if (!hit) return null;
                  return (
                    <div key={pageId} className="pdf-theme-page-row">
                      <span className="pdf-theme-page-index">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="pdf-theme-page-copy">
                        <strong>{hit.document.name}</strong>
                        <small>第 {hit.page.number} 页</small>
                      </span>
                      <IconButton
                        label="移出主题"
                        className="danger-hover"
                        onClick={() => removeThemePage(pageId)}
                        disabled={themeSaving}
                      >
                        <X size={13} />
                      </IconButton>
                    </div>
                  );
                })}
              </div>
            </div>
            {themeDraftError && <p className="pdf-form-error">{themeDraftError}</p>}
            <div className="pdf-form-actions">
              {onOpenLibrary && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onOpenLibrary();
                    setThemeDraft(null);
                  }}
                >
                  查看主题库
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setThemeDraft(null)}
                disabled={themeSaving}
              >
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={themeSaving}
                onClick={() => void saveThemeDraft()}
              >
                存入主题库
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(previewHit)}
        title={
          previewHit
            ? `${previewHit.document.name} · 第 ${previewHit.page.number} 页`
            : '页面预览'
        }
        onClose={() => setPreviewPageId('')}
        wide
      >
        {previewHit && (
          <div className="pdf-preview-body">
            <PdfPageCanvas
              documentId={previewHit.document.id}
              pageNumber={previewHit.page.number}
              width={previewHit.page.width}
              height={previewHit.page.height}
              className="is-preview"
            />
          </div>
        )}
      </Modal>

      {busy && !busy.startsWith('导入') && (
        <div className="pdf-busy-pill">
          <LoaderCircle size={13} className="spin" />
          {busy}
        </div>
      )}
      {toast && (
        <div className={`pdf-toast is-${toast.kind}`} role="status">
          {toast.kind === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <span>{toast.text}</span>
          <button aria-label="关闭提示" onClick={() => setToast(null)}>
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
