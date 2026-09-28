import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

export async function loadPdfRenderLibrary() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}
