import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pdfStudioApi } from '../../lib/pdfStudioApi';

GlobalWorkerOptions.workerSrc = workerUrl;

const documentCache = new Map<string, Promise<PDFDocumentProxy>>();

const loadDocument = (documentId: string) => {
  const cached = documentCache.get(documentId);
  if (cached) return cached;
  const loading = Promise.resolve(pdfStudioApi.documentUrl(documentId)).then((url) =>
    getDocument({ url }).promise
  );
  documentCache.set(documentId, loading);
  loading.catch(() => documentCache.delete(documentId));
  return loading;
};

export function PdfPageCanvas({
  documentId,
  pageNumber,
  width,
  height,
  className = ''
}: {
  documentId: string;
  pageNumber: number;
  width: number;
  height: number;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [hostWidth, setHostWidth] = useState(0);
  const [status, setStatus] = useState<'idle' | 'ready' | 'error'>('idle');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '180px 0px' }
    );
    observer.observe(host);
    const resize = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width || 0;
      setHostWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
    });
    resize.observe(host);
    return () => {
      observer.disconnect();
      resize.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null;

    const render = async () => {
      try {
        const pdf = await loadDocument(documentId);
        if (cancelled) return;
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const base = page.getViewport({ scale: 1 });
        const cssWidth = Math.max(hostWidth || 180, 120);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.max(0.35, (cssWidth * pixelRatio) / base.width);
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        task = page.render({ canvasContext: context, viewport, canvas });
        await task.promise;
        if (!cancelled) setStatus('ready');
        page.cleanup();
      } catch (error) {
        if (!cancelled) {
          const name = error instanceof Error ? error.name : '';
          if (name !== 'RenderingCancelledException') setStatus('error');
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [documentId, hostWidth, pageNumber, visible]);

  return (
    <div
      ref={hostRef}
      className={`pdf-page-canvas ${status === 'ready' ? 'is-ready' : ''} ${className}`}
      style={{ aspectRatio: `${width || 595} / ${height || 842}` }}
    >
      {status !== 'ready' && (
        <span className="pdf-page-canvas-fallback" aria-hidden="true">
          <FileText size={18} strokeWidth={1.4} />
        </span>
      )}
      <canvas ref={canvasRef} aria-label={`PDF 第 ${pageNumber} 页预览`} />
    </div>
  );
}
