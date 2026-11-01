import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const dataDir = path.resolve(
  process.env.PDF_STUDIO_DATA_DIR || path.join(appRoot, 'data')
);
