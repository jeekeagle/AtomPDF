import type {
  PdfExportScope,
  PdfNodeTone,
  PdfStudioState,
  PdfThemeRecord,
  PdfTreeNode
} from '../types';

const readError = async (response: Response, fallback: string) => {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || `${fallback} (${response.status})`;
};

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    }
  });
  if (!response.ok) throw new Error(await readError(response, '请求失败'));
  return response.json() as Promise<T>;
}

const parseDownloadName = (response: Response, fallback: string) => {
  const disposition = response.headers.get('Content-Disposition') || '';
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return fallback;
    }
  }
  const plain = disposition.match(/filename="([^"]+)"/i);
  return plain?.[1] || fallback;
};

export interface PdfExportResult {
  blob: Blob;
  fileName: string;
  pageCount: number;
}

export const serverApi = {
  state: () => jsonRequest<PdfStudioState>('/api/pdf-studio'),

  renameWorkspace: (workspaceName: string) =>
    jsonRequest<PdfStudioState>('/api/pdf-studio', {
      method: 'PATCH',
      body: JSON.stringify({ workspaceName })
    }),

  uploadDocument: async (file: File) => {
    const response = await fetch('/api/pdf-studio/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'X-File-Name': encodeURIComponent(file.name)
      },
      body: file
    });
    if (!response.ok) throw new Error(await readError(response, 'PDF 导入失败'));
    return response.json() as Promise<PdfStudioState>;
  },

  renameDocument: (id: string, name: string) =>
    jsonRequest<PdfStudioState>(`/api/pdf-studio/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    }),

  deleteDocument: (id: string) =>
    jsonRequest<PdfStudioState>(`/api/pdf-studio/documents/${id}`, {
      method: 'DELETE'
    }),

  documentUrl: (id: string) => `/api/pdf-studio/documents/${id}/file`,

  documentDownloadUrl: (id: string) => `/api/pdf-studio/documents/${id}/file?download=1`,

  createNode: (payload: {
    title: string;
    parentId: string | null;
    note?: string;
    tone?: PdfNodeTone;
  }) =>
    jsonRequest<{ state: PdfStudioState; node: PdfTreeNode }>('/api/pdf-studio/nodes', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateNode: (
    id: string,
    payload: Partial<{
      title: string;
      parentId: string | null;
      note: string;
      tone: PdfNodeTone;
      order: number;
    }>
  ) =>
    jsonRequest<PdfStudioState>(`/api/pdf-studio/nodes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  deleteNode: (id: string) =>
    jsonRequest<PdfStudioState>(`/api/pdf-studio/nodes/${id}`, {
      method: 'DELETE'
    }),

  createTheme: (payload: {
    title: string;
    note?: string;
    pages: string[];
    coverPageId?: string | null;
  }) =>
    jsonRequest<{ state: PdfStudioState; theme: PdfThemeRecord }>(
      '/api/pdf-studio/themes',
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    ),

  updateTheme: (
    id: string,
    payload: Partial<{
      title: string;
      note: string;
      pages: string[];
      coverPageId: string | null;
    }>
  ) =>
    jsonRequest<PdfStudioState>(`/api/pdf-studio/themes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  deleteTheme: (id: string) =>
    jsonRequest<PdfStudioState>(`/api/pdf-studio/themes/${id}`, {
      method: 'DELETE'
    }),

  addPages: (nodeId: string, pageIds: string[], index?: number) =>
    jsonRequest<PdfStudioState>(`/api/pdf-studio/nodes/${nodeId}/pages`, {
      method: 'POST',
      body: JSON.stringify({ pageIds, index })
    }),

  removePages: (nodeId: string, pageIds: string[]) =>
    jsonRequest<PdfStudioState>(`/api/pdf-studio/nodes/${nodeId}/pages/remove`, {
      method: 'POST',
      body: JSON.stringify({ pageIds })
    }),

  reorderPages: (nodeId: string, pageIds: string[]) =>
    jsonRequest<PdfStudioState>(`/api/pdf-studio/nodes/${nodeId}/pages`, {
      method: 'PATCH',
      body: JSON.stringify({ pageIds })
    }),

  exportPdf: async (payload: {
    scope: PdfExportScope;
    nodeId?: string;
    pageIds?: string[];
    title?: string;
  }): Promise<PdfExportResult> => {
    const response = await fetch('/api/pdf-studio/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await readError(response, 'PDF 导出失败'));
    return {
      blob: await response.blob(),
      fileName: parseDownloadName(response, '页序导出.pdf'),
      pageCount: Number(response.headers.get('X-Page-Count')) || 0
    };
  }
};
