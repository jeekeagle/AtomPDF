export type PdfNodeTone = 'brick' | 'teal' | 'gold' | 'ink';
export type PdfStudioTheme = 'paper' | 'noir' | 'ink';
export type PdfExportScope = 'node' | 'branch' | 'selection';

export interface PdfDocumentPage {
  id: string;
  number: number;
  width: number;
  height: number;
  textPreview: string;
}

export interface PdfDocumentRecord {
  id: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  pageCount: number;
  importedAt: string;
  pages: PdfDocumentPage[];
}

export interface PdfTreeNode {
  id: string;
  parentId: string | null;
  title: string;
  note: string;
  tone: PdfNodeTone;
  order: number;
  pages: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PdfStudioStats {
  documents: number;
  pages: number;
  nodes: number;
  placedPages: number;
  themes: number;
}

export interface PdfThemeRecord {
  id: string;
  title: string;
  note: string;
  coverPageId: string | null;
  pages: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PdfStudioState {
  workspaceName: string;
  documents: PdfDocumentRecord[];
  nodes: PdfTreeNode[];
  themes: PdfThemeRecord[];
  stats: PdfStudioStats;
  updatedAt: string;
}
