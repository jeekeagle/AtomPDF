import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookMarked,
  CheckCircle2,
  Download,
  Layers,
  LoaderCircle,
  Pencil,
  Trash2,
  X
} from 'lucide-react';
import { PdfPageCanvas } from '../components/pdf/PdfPageCanvas';
import { Button, IconButton, Modal } from '../components/ui';
import { pdfStudioApi } from '../lib/pdfStudioApi';
import type {
  PdfDocumentPage,
  PdfDocumentRecord,
  PdfStudioState,
  PdfThemeRecord
} from '../types';

interface PageHit {
  document: PdfDocumentRecord;
  page: PdfDocumentPage;
}

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate()
  ).padStart(2, '0')}`;
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

export function ThemeLibraryPage() {
  const [studio, setStudio] = useState<PdfStudioState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNote, setDraftNote] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setStudio(await pdfStudioApi.state());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '主题库加载失败');
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

  const pageIndex = useMemo(() => {
    const index = new Map<string, PageHit>();
    for (const document of studio?.documents ?? []) {
      for (const page of document.pages) index.set(page.id, { document, page });
    }
    return index;
  }, [studio?.documents]);

  const themes = useMemo(
    () =>
      [...(studio?.themes ?? [])].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),
    [studio?.themes]
  );

  const active = themes.find((theme) => theme.id === activeId) ?? null;

  const openTheme = (theme: PdfThemeRecord) => {
    setActiveId(theme.id);
    setDraftTitle(theme.title);
    setDraftNote(theme.note);
    setEditing(false);
  };

  const updateTheme = async (
    theme: PdfThemeRecord,
    payload: Partial<{
      title: string;
      note: string;
      pages: string[];
      coverPageId: string | null;
    }>
  ) => {
    const next = await pdfStudioApi.updateTheme(theme.id, payload);
    setStudio(next);
  };

  const movePage = async (theme: PdfThemeRecord, index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= theme.pages.length) return;
    const pages = [...theme.pages];
    const [moved] = pages.splice(index, 1);
    pages.splice(target, 0, moved);
    setBusy('调整页序');
    try {
      await updateTheme(theme, { pages });
    } catch (updateError) {
      setToast({
        kind: 'error',
        text: updateError instanceof Error ? updateError.message : '调整页序失败'
      });
    } finally {
      setBusy('');
    }
  };

  const removePage = async (theme: PdfThemeRecord, pageId: string) => {
    const pages = theme.pages.filter((id) => id !== pageId);
    setBusy('移出页面');
    try {
      await updateTheme(theme, {
        pages,
        coverPageId: theme.coverPageId === pageId ? pages[0] ?? null : theme.coverPageId
      });
    } catch (removeError) {
      setToast({
        kind: 'error',
        text: removeError instanceof Error ? removeError.message : '移出页面失败'
      });
    } finally {
      setBusy('');
    }
  };

  const saveMeta = async () => {
    if (!active) return;
    const title = draftTitle.trim();
    if (!title) {
      setToast({ kind: 'error', text: '主题名称不能为空' });
      return;
    }
    setBusy('保存');
    try {
      await updateTheme(active, { title, note: draftNote });
      setEditing(false);
      setToast({ kind: 'ok', text: '主题已更新' });
    } catch (saveError) {
      setToast({
        kind: 'error',
        text: saveError instanceof Error ? saveError.message : '保存失败'
      });
    } finally {
      setBusy('');
    }
  };

  const exportTheme = async (theme: PdfThemeRecord) => {
    setBusy('生成 PDF');
    try {
      const result = await pdfStudioApi.exportPdf({
        scope: 'selection',
        pageIds: theme.pages,
        title: theme.title
      });
      saveBlob(result.blob, result.fileName);
      setToast({ kind: 'ok', text: `已导出 ${result.pageCount || theme.pages.length} 页` });
    } catch (exportError) {
      setToast({
        kind: 'error',
        text: exportError instanceof Error ? exportError.message : '导出失败'
      });
    } finally {
      setBusy('');
    }
  };

  const deleteTheme = async (theme: PdfThemeRecord) => {
    if (!window.confirm(`删除主题「${theme.title}」？页面本身不会被删除。`)) return;
    setBusy('删除主题');
    try {
      const next = await pdfStudioApi.deleteTheme(theme.id);
      setStudio(next);
      setActiveId('');
      setToast({ kind: 'ok', text: '主题已删除' });
    } catch (deleteError) {
      setToast({
        kind: 'error',
        text: deleteError instanceof Error ? deleteError.message : '删除失败'
      });
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <div className="page pdf-studio-page theme-library-page">
        <div className="pdf-library-loading">
          <LoaderCircle size={20} className="spin" />
          正在打开主题库
        </div>
      </div>
    );
  }

  if (error || !studio) {
    return (
      <div className="page pdf-studio-page theme-library-page">
        <div className="pdf-library-loading">
          <AlertCircle size={20} />
          {error || '主题库不可用'}
        </div>
      </div>
    );
  }

  return (
    <div className="page pdf-studio-page theme-library-page">
      <header className="pdf-studio-head">
        <div className="pdf-studio-title">
          <span className="eyebrow">THEMES</span>
          <div className="pdf-title-line">
            <h1>主题库</h1>
          </div>
        </div>
        <div className="pdf-head-side">
          <div className="pdf-stat-row">
            <span>
              <BookMarked size={14} />
              <strong>{themes.length}</strong>
              个主题
            </span>
            <span>
              <Layers size={14} />
              <strong>
                {themes.reduce((sum, theme) => sum + theme.pages.length, 0)}
              </strong>
              页已组合
            </span>
          </div>
        </div>
      </header>

      {themes.length ? (
        <div className="pdf-theme-grid">
          {themes.map((theme) => {
            const cover = theme.coverPageId ? pageIndex.get(theme.coverPageId) : null;
            return (
              <article key={theme.id} className="pdf-theme-card">
                <button className="pdf-theme-card-cover" onClick={() => openTheme(theme)}>
                  {cover ? (
                    <PdfPageCanvas
                      documentId={cover.document.id}
                      pageNumber={cover.page.number}
                      width={cover.page.width}
                      height={cover.page.height}
                    />
                  ) : (
                    <span className="pdf-theme-card-empty">
                      <BookMarked size={22} />
                    </span>
                  )}
                  <span className="pdf-theme-card-count">{theme.pages.length} 页</span>
                </button>
                <div className="pdf-theme-card-body">
                  <div className="pdf-theme-card-head">
                    <strong>{theme.title}</strong>
                    <span className="pdf-theme-card-date">{formatDate(theme.createdAt)}</span>
                  </div>
                  <p>{theme.note || '还没有写说明'}</p>
                  <div className="pdf-theme-card-actions">
                    <Button size="sm" variant="secondary" onClick={() => openTheme(theme)}>
                      打开
                    </Button>
                    <IconButton
                      label="导出 PDF"
                      onClick={() => void exportTheme(theme)}
                      disabled={Boolean(busy)}
                    >
                      <Download size={14} />
                    </IconButton>
                    <IconButton
                      label="删除主题"
                      className="danger-hover"
                      onClick={() => void deleteTheme(theme)}
                      disabled={Boolean(busy)}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="pdf-theme-empty">
          <BookMarked size={26} />
          <strong>还没有主题</strong>
          <span>回到工作台，勾选一些页面后点「组合为主题」。</span>
        </div>
      )}

      <Modal
        open={Boolean(active)}
        title={active?.title ?? ''}
        description={active ? `${active.pages.length} 页 · 建于 ${formatDate(active.createdAt)}` : ''}
        wide
        onClose={() => setActiveId('')}
      >
        {active && (
          <div className="pdf-theme-detail">
            {editing ? (
              <div className="pdf-theme-detail-meta">
                <label className="pdf-field">
                  <span>主题名称</span>
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    maxLength={60}
                  />
                </label>
                <label className="pdf-field">
                  <span>主题说明</span>
                  <textarea
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                    rows={3}
                    maxLength={240}
                  />
                </label>
                <div className="pdf-form-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(false);
                      setDraftTitle(active.title);
                      setDraftNote(active.note);
                    }}
                  >
                    取消
                  </Button>
                  <Button variant="primary" size="sm" loading={busy === '保存'} onClick={() => void saveMeta()}>
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              <div className="pdf-theme-detail-head">
                <p>{active.note || '还没有写说明'}</p>
                <div className="pdf-theme-detail-actions">
                  <IconButton
                    label="编辑主题信息"
                    onClick={() => setEditing(true)}
                    disabled={Boolean(busy)}
                  >
                    <Pencil size={14} />
                  </IconButton>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Download size={14} />}
                    loading={busy === '生成 PDF'}
                    onClick={() => void exportTheme(active)}
                  >
                    导出 PDF
                  </Button>
                </div>
              </div>
            )}

            <div className="pdf-theme-detail-list">
              {active.pages.map((pageId, index) => {
                const hit = pageIndex.get(pageId);
                if (!hit) return null;
                return (
                  <div key={pageId} className="pdf-theme-detail-row">
                    <span className="pdf-theme-page-index">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="pdf-theme-detail-thumb">
                      <PdfPageCanvas
                        documentId={hit.document.id}
                        pageNumber={hit.page.number}
                        width={hit.page.width}
                        height={hit.page.height}
                      />
                    </span>
                    <span className="pdf-theme-page-copy">
                      <strong>{hit.document.name}</strong>
                      <small>第 {hit.page.number} 页</small>
                      <em>{hit.page.textPreview || '无文字层'}</em>
                    </span>
                    <span className="pdf-theme-detail-tools">
                      <IconButton
                        label="上移"
                        onClick={() => void movePage(active, index, -1)}
                        disabled={index === 0 || Boolean(busy)}
                      >
                        <ArrowUp size={13} />
                      </IconButton>
                      <IconButton
                        label="下移"
                        onClick={() => void movePage(active, index, 1)}
                        disabled={index === active.pages.length - 1 || Boolean(busy)}
                      >
                        <ArrowDown size={13} />
                      </IconButton>
                      <IconButton
                        label="移出主题"
                        className="danger-hover"
                        onClick={() => void removePage(active, pageId)}
                        disabled={Boolean(busy)}
                      >
                        <X size={13} />
                      </IconButton>
                    </span>
                  </div>
                );
              })}
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
