import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  FolderPlus,
  LayoutGrid,
  LoaderCircle,
  Pencil,
  Trash2,
  X
} from 'lucide-react';
import { PdfPageCanvas } from '../components/pdf/PdfPageCanvas';
import { Button, IconButton, Modal } from '../components/ui';
import { pdfStudioApi } from '../lib/pdfStudioApi';
import type {
  PdfCategory,
  PdfNodeTone,
  PdfStudioState
} from '../types';

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate()
  ).padStart(2, '0')}`;
};

const toneLabels: Record<PdfNodeTone, string> = {
  brick: '砖红',
  teal: '青绿',
  gold: '赭金',
  ink: '墨灰'
};

export function FilesView() {
  const [studio, setStudio] = useState<PdfStudioState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [categoryDraft, setCategoryDraft] = useState<{
    mode: 'create' | 'edit';
    id?: string;
    name: string;
    tone: PdfNodeTone;
  } | null>(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setStudio(await pdfStudioApi.state());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '文件清单加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const categories = useMemo(
    () => [...(studio?.categories ?? [])].sort((a, b) => a.order - b.order),
    [studio?.categories]
  );

  const usageOf = (documentId: string) =>
    (studio?.nodes ?? []).filter((node) =>
      node.pages.some((pageId) => pageId.startsWith(`${documentId}:`))
    ).length;

  const documents = useMemo(() => {
    const all = studio?.documents ?? [];
    if (filter === 'all') return all;
    if (filter === 'none') return all.filter((item) => !item.categoryId);
    return all.filter((item) => item.categoryId === filter);
  }, [filter, studio?.documents]);

  const commitRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) {
      setEditingId('');
      return;
    }
    setBusy('重命名');
    try {
      setStudio(await pdfStudioApi.renameDocument(id, name));
      setEditingId('');
      setToast({ kind: 'ok', text: '文件已重命名' });
    } catch (renameError) {
      setToast({
        kind: 'error',
        text: renameError instanceof Error ? renameError.message : '重命名失败'
      });
    } finally {
      setBusy('');
    }
  };

  const moveToCategory = async (id: string, categoryId: string) => {
    setBusy('调整分类');
    try {
      const document = (studio?.documents ?? []).find((item) => item.id === id);
      setStudio(
        await pdfStudioApi.renameDocument(
          id,
          document?.name ?? '未命名',
          categoryId || null
        )
      );
    } catch (moveError) {
      setToast({
        kind: 'error',
        text: moveError instanceof Error ? moveError.message : '调整分类失败'
      });
    } finally {
      setBusy('');
    }
  };

  const removeDocument = async (id: string, name: string) => {
    if (!window.confirm(`删除「${name}」？相关页面会从分类树里移除，原文件不可恢复。`)) return;
    setBusy('删除文件');
    try {
      setStudio(await pdfStudioApi.deleteDocument(id));
      setToast({ kind: 'ok', text: '文件已删除' });
    } catch (deleteError) {
      setToast({
        kind: 'error',
        text: deleteError instanceof Error ? deleteError.message : '删除失败'
      });
    } finally {
      setBusy('');
    }
  };

  const downloadDocument = async (id: string, name: string) => {
    setBusy('下载文件');
    try {
      const result = await pdfStudioApi.downloadDocument(id);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName || `${name}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (downloadError) {
      setToast({
        kind: 'error',
        text: downloadError instanceof Error ? downloadError.message : '下载失败'
      });
    } finally {
      setBusy('');
    }
  };

  const saveCategory = async () => {
    if (!categoryDraft) return;
    const name = categoryDraft.name.trim();
    if (!name) return;
    setBusy('保存分类');
    try {
      if (categoryDraft.mode === 'create') {
        await pdfStudioApi.createCategory({ name, tone: categoryDraft.tone });
      } else if (categoryDraft.id) {
        await pdfStudioApi.updateCategory(categoryDraft.id, { name, tone: categoryDraft.tone });
      }
      setStudio(await pdfStudioApi.state());
      setCategoryDraft(null);
      setToast({ kind: 'ok', text: '分类已保存' });
    } catch (saveError) {
      setToast({
        kind: 'error',
        text: saveError instanceof Error ? saveError.message : '保存分类失败'
      });
    } finally {
      setBusy('');
    }
  };

  const removeCategory = async (category: PdfCategory) => {
    if (
      !window.confirm(
        `删除分类「${category.name}」？分类里的文件会变成「未分类」，文件本身不受影响。`
      )
    ) {
      return;
    }
    setBusy('删除分类');
    try {
      setStudio(await pdfStudioApi.deleteCategory(category.id));
      if (filter === category.id) setFilter('all');
      setToast({ kind: 'ok', text: '分类已删除' });
    } catch (deleteError) {
      setToast({
        kind: 'error',
        text: deleteError instanceof Error ? deleteError.message : '删除分类失败'
      });
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <div className="page pdf-studio-page files-page">
        <div className="pdf-library-loading">
          <LoaderCircle size={20} className="spin" />
          正在打开文件清单
        </div>
      </div>
    );
  }

  if (error || !studio) {
    return (
      <div className="page pdf-studio-page files-page">
        <div className="pdf-library-loading">
          <AlertCircle size={20} />
          {error || '文件清单不可用'}
        </div>
      </div>
    );
  }

  const totalPages = studio.documents.reduce((sum, item) => sum + item.pageCount, 0);

  return (
    <div className="page pdf-studio-page files-page">
      <header className="pdf-studio-head">
        <div className="pdf-studio-title">
          <span className="eyebrow">FILES</span>
          <div className="pdf-title-line">
            <h1>文件清单</h1>
          </div>
        </div>
        <div className="pdf-head-side">
          <div className="pdf-stat-row">
            <span>
              <FileText size={14} />
              <strong>{studio.documents.length}</strong>
              个文件
            </span>
            <span>
              <LayoutGrid size={14} />
              <strong>{totalPages}</strong>
              页
            </span>
            <span>
              <FolderPlus size={14} />
              <strong>{categories.length}</strong>
              个分类
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<FolderPlus size={14} />}
            onClick={() =>
              setCategoryDraft({ mode: 'create', name: '', tone: 'teal' })
            }
          >
            新建分类
          </Button>
        </div>
      </header>

      <div className="pdf-file-filters">
        <button
          className={`pdf-file-chip ${filter === 'all' ? 'is-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          全部
          <span>{studio.documents.length}</span>
        </button>
        <button
          className={`pdf-file-chip ${filter === 'none' ? 'is-active' : ''}`}
          onClick={() => setFilter('none')}
        >
          未分类
          <span>{studio.documents.filter((item) => !item.categoryId).length}</span>
        </button>
        {categories.map((category) => (
          <span key={category.id} className="pdf-file-chip-wrap">
            <button
              className={`pdf-file-chip ${filter === category.id ? 'is-active' : ''}`}
              onClick={() => setFilter(category.id)}
            >
              <span className={`pdf-tone-dot is-${category.tone}`} />
              {category.name}
              <span>
                {studio.documents.filter((item) => item.categoryId === category.id).length}
              </span>
            </button>
            <IconButton
              label="编辑分类"
              onClick={() =>
                setCategoryDraft({
                  mode: 'edit',
                  id: category.id,
                  name: category.name,
                  tone: category.tone
                })
              }
              disabled={Boolean(busy)}
            >
              <Pencil size={12} />
            </IconButton>
            <IconButton
              label="删除分类"
              className="danger-hover"
              onClick={() => void removeCategory(category)}
              disabled={Boolean(busy)}
            >
              <X size={12} />
            </IconButton>
          </span>
        ))}
      </div>

      {documents.length ? (
        <div className="pdf-file-list">
          <div className="pdf-file-row pdf-file-row-head">
            <span>文件</span>
            <span>分类</span>
            <span>页数</span>
            <span>大小</span>
            <span>入库</span>
            <span>分类引用</span>
            <span />
          </div>
          {documents.map((document) => (
            <div key={document.id} className="pdf-file-row">
              <span className="pdf-file-cell pdf-file-name-cell">
                <span className="pdf-file-thumb">
                  <PdfPageCanvas
                    documentId={document.id}
                    pageNumber={1}
                    width={document.pages[0]?.width ?? 595}
                    height={document.pages[0]?.height ?? 842}
                  />
                </span>
                {editingId === document.id ? (
                  <input
                    className="pdf-file-rename"
                    value={editingName}
                    autoFocus
                    onChange={(event) => setEditingName(event.target.value)}
                    onBlur={() => void commitRename(document.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void commitRename(document.id);
                      if (event.key === 'Escape') setEditingId('');
                    }}
                  />
                ) : (
                  <button
                    className="pdf-file-name"
                    onClick={() => {
                      setEditingId(document.id);
                      setEditingName(document.name);
                    }}
                    title="点击重命名"
                  >
                    <strong>{document.name}</strong>
                    <small>{document.fileName}</small>
                  </button>
                )}
              </span>
              <span className="pdf-file-cell">
                <select
                  className="pdf-file-category"
                  value={document.categoryId ?? ''}
                  onChange={(event) => void moveToCategory(document.id, event.target.value)}
                  disabled={Boolean(busy)}
                >
                  <option value="">未分类</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </span>
              <span className="pdf-file-cell pdf-file-num">{document.pageCount}</span>
              <span className="pdf-file-cell pdf-file-num">
                {formatBytes(document.sizeBytes)}
              </span>
              <span className="pdf-file-cell pdf-file-num">{formatDate(document.importedAt)}</span>
              <span className="pdf-file-cell pdf-file-num">{usageOf(document.id)} 处</span>
              <span className="pdf-file-cell pdf-file-tools">
                <IconButton
                  label="下载原文件"
                  onClick={() => void downloadDocument(document.id, document.name)}
                  disabled={Boolean(busy)}
                >
                  <Download size={14} />
                </IconButton>
                <IconButton
                  label="删除文件"
                  className="danger-hover"
                  onClick={() => void removeDocument(document.id, document.name)}
                  disabled={Boolean(busy)}
                >
                  <Trash2 size={14} />
                </IconButton>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="pdf-theme-empty">
          <FileText size={26} />
          <strong>这里还没有文件</strong>
          <span>回到工作台导入 PDF，或者换个分类看看。</span>
        </div>
      )}

      <Modal
        open={Boolean(categoryDraft)}
        title={categoryDraft?.mode === 'create' ? '新建文件分类' : '编辑分类'}
        onClose={() => setCategoryDraft(null)}
      >
        {categoryDraft && (
          <div className="pdf-node-form">
            <label className="pdf-field">
              <span>分类名称</span>
              <input
                value={categoryDraft.name}
                onChange={(event) =>
                  setCategoryDraft({ ...categoryDraft, name: event.target.value })
                }
                maxLength={30}
                autoFocus
              />
            </label>
            <div className="pdf-field">
              <span>标记色</span>
              <div className="pdf-tone-options">
                {(Object.keys(toneLabels) as PdfNodeTone[]).map((tone) => (
                  <button
                    key={tone}
                    className={categoryDraft.tone === tone ? 'is-active' : ''}
                    onClick={() => setCategoryDraft({ ...categoryDraft, tone })}
                  >
                    <span className={`pdf-tone-swatch is-${tone}`} />
                    {toneLabels[tone]}
                  </button>
                ))}
              </div>
            </div>
            <div className="pdf-form-actions">
              <Button variant="ghost" size="sm" onClick={() => setCategoryDraft(null)}>
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={busy === '保存分类'}
                onClick={() => void saveCategory()}
              >
                保存
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {busy && (
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
