import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Download,
  FolderPlus,
  LoaderCircle,
  Plus,
  Trash2,
  X
} from 'lucide-react';
import { PdfPageCanvas } from '../components/pdf/PdfPageCanvas';
import { Button, IconButton } from '../components/ui';
import { pdfStudioApi } from '../lib/pdfStudioApi';
import type { PdfLesson, PdfStudioState } from '../types';

interface DraftLesson extends PdfLesson {
  documentName: string;
}

export function CourseBuilder() {
  const [studio, setStudio] = useState<PdfStudioState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [courseNote, setCourseNote] = useState('');
  const [lessons, setLessons] = useState<DraftLesson[]>([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setStudio(await pdfStudioApi.state());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '组课台加载失败');
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

  const documents = studio?.documents ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, typeof documents>();
    for (const category of categories) map.set(category.id, []);
    map.set('none', []);
    for (const document of documents) {
      const key = document.categoryId && map.has(document.categoryId) ? document.categoryId : 'none';
      map.get(key)!.push(document);
    }
    return map;
  }, [categories, documents]);

  const addLesson = (documentId: string) => {
    const document = documents.find((item) => item.id === documentId);
    if (!document) return;
    setLessons((current) => [
      ...current,
      {
        id: `lesson-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`,
        title: document.name,
        documentId: document.id,
        documentName: document.name,
        pageFrom: 1,
        pageTo: document.pageCount,
        note: ''
      }
    ]);
  };

  const updateLesson = (id: string, patch: Partial<DraftLesson>) => {
    setLessons((current) =>
      current.map((lesson) => (lesson.id === id ? { ...lesson, ...patch } : lesson))
    );
  };

  const moveLesson = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    setLessons((current) => {
      const copy = [...current];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
  };

  const totalPages = lessons.reduce(
    (sum, lesson) => sum + (lesson.pageTo - lesson.pageFrom + 1),
    0
  );

  const saveCourse = async () => {
    const title = courseTitle.trim();
    if (!title) {
      setToast({ kind: 'error', text: '请先给课程起个名字' });
      return;
    }
    if (!lessons.length) {
      setToast({ kind: 'error', text: '课程里至少要有一课' });
      return;
    }
    setBusy('保存课程');
    try {
      const result = await pdfStudioApi.createCourse({
        title,
        note: courseNote,
        lessons: lessons.map(({ documentName: _name, ...lesson }) => lesson)
      });
      setStudio(result.state);
      setCourseTitle('');
      setCourseNote('');
      setLessons([]);
      setToast({ kind: 'ok', text: `「${title}」已存入课程库` });
    } catch (saveError) {
      setToast({
        kind: 'error',
        text: saveError instanceof Error ? saveError.message : '保存课程失败'
      });
    } finally {
      setBusy('');
    }
  };

  const exportCourse = async () => {
    if (!lessons.length) {
      setToast({ kind: 'error', text: '先加几课再导出' });
      return;
    }
    setBusy('生成 PDF');
    try {
      const pageIds = lessons.flatMap((lesson) => {
        const pages: string[] = [];
        for (let page = lesson.pageFrom; page <= lesson.pageTo; page += 1) {
          pages.push(`${lesson.documentId}:${page}`);
        }
        return pages;
      });
      const result = await pdfStudioApi.exportPdf({
        scope: 'selection',
        pageIds,
        title: courseTitle.trim() || '组课导出'
      });
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setToast({ kind: 'ok', text: `已导出 ${result.pageCount} 页` });
    } catch (exportError) {
      setToast({
        kind: 'error',
        text: exportError instanceof Error ? exportError.message : '导出失败'
      });
    } finally {
      setBusy('');
    }
  };

  const exportSavedCourse = async (courseId: string, title: string) => {
    setBusy('生成 PDF');
    try {
      const result = await pdfStudioApi.exportPdf({
        scope: 'course',
        courseId,
        title
      });
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setToast({ kind: 'ok', text: `已导出 ${result.pageCount} 页` });
    } catch (exportError) {
      setToast({
        kind: 'error',
        text: exportError instanceof Error ? exportError.message : '导出失败'
      });
    } finally {
      setBusy('');
    }
  };

  const removeCourse = async (id: string, title: string) => {
    if (!window.confirm(`删除课程「${title}」？`)) return;
    setBusy('删除课程');
    try {
      setStudio(await pdfStudioApi.deleteCourse(id));
      setToast({ kind: 'ok', text: '课程已删除' });
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
      <div className="page pdf-studio-page course-page">
        <div className="pdf-library-loading">
          <LoaderCircle size={20} className="spin" />
          正在打开组课台
        </div>
      </div>
    );
  }

  if (error || !studio) {
    return (
      <div className="page pdf-studio-page course-page">
        <div className="pdf-library-loading">
          <AlertCircle size={20} />
          {error || '组课台不可用'}
        </div>
      </div>
    );
  }

  const renderGroup = (key: string, label: string, tone?: string) => {
    const list = grouped.get(key) ?? [];
    if (!list.length) return null;
    return (
      <div key={key} className="pdf-course-pool-group">
        <span className="pdf-course-pool-label">
          {tone ? <span className={`pdf-tone-dot is-${tone}`} /> : null}
          {label}
          <em>{list.length}</em>
        </span>
        {list.map((document) => (
          <div key={document.id} className="pdf-course-pool-row">
            <span className="pdf-course-pool-thumb">
              <PdfPageCanvas
                documentId={document.id}
                pageNumber={1}
                width={document.pages[0]?.width ?? 595}
                height={document.pages[0]?.height ?? 842}
              />
            </span>
            <span className="pdf-course-pool-copy">
              <strong>{document.name}</strong>
              <small>{document.pageCount} 页</small>
            </span>
            <IconButton
              label="加入课程"
              onClick={() => addLesson(document.id)}
              disabled={Boolean(busy)}
            >
              <Plus size={14} />
            </IconButton>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="page pdf-studio-page course-page">
      <header className="pdf-studio-head">
        <div className="pdf-studio-title">
          <span className="eyebrow">COURSES</span>
          <div className="pdf-title-line">
            <h1>按文件组课</h1>
          </div>
        </div>
        <div className="pdf-head-side">
          <div className="pdf-stat-row">
            <span>
              <BookOpen size={14} />
              <strong>{lessons.length}</strong>
              课
            </span>
            <span>
              <FolderPlus size={14} />
              <strong>{totalPages}</strong>
              页
            </span>
            <span>
              <Download size={14} />
              <strong>{studio.courses.length}</strong>
              门已存课程
            </span>
          </div>
        </div>
      </header>

      <div className="pdf-course-meta">
        <input
          className="pdf-course-title-input"
          value={courseTitle}
          onChange={(event) => setCourseTitle(event.target.value)}
          placeholder="课程名称，例如：大模型导论 第一讲"
          maxLength={60}
        />
        <input
          className="pdf-course-note-input"
          value={courseNote}
          onChange={(event) => setCourseNote(event.target.value)}
          placeholder="课程说明（可选）"
          maxLength={120}
        />
      </div>

      <div className="pdf-course-layout">
        <section className="pdf-course-pool">
          <div className="pdf-course-panel-head">
            <span className="eyebrow">LIBRARY</span>
            <strong>文件池</strong>
          </div>
          <div className="pdf-course-pool-scroll">
            {documents.length ? (
              <>
                {categories.map((category) =>
                  renderGroup(category.id, category.name, category.tone)
                )}
                {renderGroup('none', '未分类')}
              </>
            ) : (
              <div className="pdf-course-empty">
                <BookOpen size={20} />
                还没有文件，先去工作台导入 PDF
              </div>
            )}
          </div>
        </section>

        <section className="pdf-course-outline">
          <div className="pdf-course-panel-head">
            <span className="eyebrow">OUTLINE</span>
            <strong>课程大纲</strong>
          </div>
          <div className="pdf-course-lessons">
            {lessons.length ? (
              lessons.map((lesson, index) => (
                <div key={lesson.id} className="pdf-course-lesson">
                  <span className="pdf-course-lesson-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="pdf-course-lesson-main">
                    <input
                      className="pdf-course-lesson-title"
                      value={lesson.title}
                      onChange={(event) =>
                        updateLesson(lesson.id, { title: event.target.value })
                      }
                      maxLength={60}
                      placeholder="课次名称"
                    />
                    <div className="pdf-course-lesson-meta">
                      <span className="pdf-course-source">{lesson.documentName}</span>
                      <label className="pdf-course-range">
                        第
                        <input
                          type="number"
                          min={1}
                          max={lesson.pageTo}
                          value={lesson.pageFrom}
                          onChange={(event) =>
                            updateLesson(lesson.id, {
                              pageFrom: Math.max(1, Number(event.target.value) || 1)
                            })
                          }
                        />
                        –
                        <input
                          type="number"
                          min={lesson.pageFrom}
                          value={lesson.pageTo}
                          onChange={(event) =>
                            updateLesson(lesson.id, {
                              pageTo: Math.max(
                                lesson.pageFrom,
                                Number(event.target.value) || lesson.pageFrom
                              )
                            })
                          }
                        />
                        页
                      </label>
                    </div>
                    <input
                      className="pdf-course-lesson-note"
                      value={lesson.note}
                      onChange={(event) =>
                        updateLesson(lesson.id, { note: event.target.value })
                      }
                      placeholder="这节课讲什么（可选）"
                      maxLength={120}
                    />
                  </div>
                  <div className="pdf-course-lesson-tools">
                    <IconButton
                      label="上移"
                      onClick={() => moveLesson(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp size={13} />
                    </IconButton>
                    <IconButton
                      label="下移"
                      onClick={() => moveLesson(index, 1)}
                      disabled={index === lessons.length - 1}
                    >
                      <ArrowDown size={13} />
                    </IconButton>
                    <IconButton
                      label="移出课程"
                      className="danger-hover"
                      onClick={() =>
                        setLessons((current) =>
                          current.filter((item) => item.id !== lesson.id)
                        )
                      }
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
              ))
            ) : (
              <div className="pdf-course-empty">
                <BookOpen size={20} />
                从左边挑文件，一份文件就是一课
              </div>
            )}
          </div>
          <div className="pdf-course-actions">
            <Button
              variant="secondary"
              size="md"
              icon={<Download size={15} />}
              loading={busy === '生成 PDF'}
              disabled={!lessons.length || Boolean(busy)}
              onClick={() => void exportCourse()}
            >
              导出整本
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={<CheckCircle2 size={15} />}
              loading={busy === '保存课程'}
              disabled={!lessons.length || Boolean(busy)}
              onClick={() => void saveCourse()}
            >
              存入课程库
            </Button>
          </div>
        </section>
      </div>

      {studio.courses.length > 0 && (
        <div className="pdf-course-library">
          <span className="eyebrow">SAVED</span>
          <strong>已存课程</strong>
          <div className="pdf-course-cards">
            {studio.courses.map((course) => (
              <article key={course.id} className="pdf-course-card">
                <div className="pdf-course-card-body">
                  <strong>{course.title}</strong>
                  <p>{course.note || '还没有写说明'}</p>
                  <span className="pdf-course-card-meta">
                    {course.lessons.length} 课 ·{' '}
                    {course.lessons.reduce(
                      (sum, lesson) => sum + (lesson.pageTo - lesson.pageFrom + 1),
                      0
                    )}{' '}
                    页
                  </span>
                </div>
                <div className="pdf-course-card-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void exportSavedCourse(course.id, course.title)}
                    disabled={Boolean(busy)}
                  >
                    导出
                  </Button>
                  <IconButton
                    label="删除课程"
                    className="danger-hover"
                    onClick={() => void removeCourse(course.id, course.title)}
                    disabled={Boolean(busy)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

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
