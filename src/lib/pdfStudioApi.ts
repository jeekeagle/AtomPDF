import { browserApi } from './pdfStudioBrowserApi';
import { serverApi } from './pdfStudioServerApi';

export type { PdfExportResult } from './pdfStudioServerApi';

/**
 * Two storage backends share one interface:
 * - server mode keeps the library on this machine (Express + local disk)
 * - browser mode keeps everything in the browser (IndexedDB), which is what
 *   the static GitHub Pages build uses
 */
export const pdfStudioApi =
  import.meta.env.VITE_PDF_MODE === 'browser' ? browserApi : serverApi;
