export type PdfNodeTone = 'brick' | 'teal' | 'gold' | 'ink';
export type PdfStudioTheme = 'paper' | 'noir' | 'ink';
export type PdfExportScope = 'node' | 'branch' | 'selection' | 'course';

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
  categoryId: string | null;
  pages: PdfDocumentPage[];
}

export interface PdfCategory {
  id: string;
  name: string;
  tone: PdfNodeTone;
  order: number;
  createdAt: string;
}

export interface PdfLesson {
  id: string;
  title: string;
  documentId: string;
  pageFrom: number;
  pageTo: number;
  note: string;
}

export interface PdfCourse {
  id: string;
  title: string;
  note: string;
  lessons: PdfLesson[];
  createdAt: string;
  updatedAt: string;
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
  categories: number;
  courses: number;
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
  categories: PdfCategory[];
  courses: PdfCourse[];
  stats: PdfStudioStats;
  updatedAt: string;
}
