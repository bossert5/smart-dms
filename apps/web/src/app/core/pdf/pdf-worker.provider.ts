import { ENVIRONMENT_INITIALIZER, makeEnvironmentProviders } from '@angular/core';

const PDFJS_DIST_VERSION = '4.8.69';
const PDF_WORKER_SRC = `/assets/pdfjs/pdf.worker.mjs?v=${PDFJS_DIST_VERSION}`;

type PdfWorkerWindow = Window &
  typeof globalThis & {
    pdfWorkerSrc?: string;
    [key: `pdfWorkerSrc${string}`]: string | undefined;
  };

export function providePdfWorker() {
  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        if (typeof window === 'undefined') {
          return;
        }

        const pdfWindow = window as PdfWorkerWindow;
        pdfWindow.pdfWorkerSrc = PDF_WORKER_SRC;
        pdfWindow[`pdfWorkerSrc${PDFJS_DIST_VERSION}`] = PDF_WORKER_SRC;
      },
    },
  ]);
}
