import PptxGenJS from 'pptxgenjs';
import { abortIfNeeded, officeFileName, openPdfForConversion, OFFICE_MIME, type PageProgress, type RendererLoader, validateOfficeBlob } from './convert-common.ts';

function canvasToDataUrl(canvas: HTMLCanvasElement) { return canvas.toDataURL('image/png'); }

export async function pdfToPowerPoint(file: File, signal: AbortSignal, onProgress: PageProgress, loadRenderer?: RendererLoader) {
  const { pdf, close } = await openPdfForConversion(file, signal, loadRenderer);
  try {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'PDF Toolkit';
    pptx.subject = 'Slides generated from PDF pages';
    pptx.title = officeFileName(file, 'pptx').replace(/\.pptx$/, '');
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      abortIfNeeded(signal);
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('This browser cannot render the PDF page. Try a modern browser.');
      await page.render({ canvas, canvasContext: context, viewport, background: 'rgb(255,255,255)' }).promise;
      const slide = pptx.addSlide();
      const slideW = 13.333; const slideH = 7.5;
      const scale = Math.min(slideW / viewport.width, slideH / viewport.height);
      const width = viewport.width * scale; const height = viewport.height * scale;
      slide.addImage({ data: canvasToDataUrl(canvas), x: (slideW - width) / 2, y: (slideH - height) / 2, w: width, h: height });
      canvas.width = 0; canvas.height = 0;
      onProgress(pageNo, pdf.numPages);
    }
    const raw = await pptx.write({ outputType: 'blob' });
    const data = raw instanceof Blob ? await raw.arrayBuffer() : raw instanceof Uint8Array ? raw.slice().buffer : raw as ArrayBuffer;
    const blob = new Blob([data], { type: OFFICE_MIME.pptx });
    await validateOfficeBlob(blob, 'pptx');
    return { name: officeFileName(file, 'pptx'), blob };
  } finally { await close(); }
}
