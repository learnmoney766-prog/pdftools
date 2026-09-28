import JSZip from 'jszip';
import { MAX_CONVERSION_PAGES, loadPdfRenderLibrary, safeBaseName } from './pdf.ts';

const MAX_CONVERT_BYTES = 100 * 1024 * 1024;
export const OFFICE_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;

export type PageProgress = (done: number, total: number) => void;
export type RendererLoader = typeof loadPdfRenderLibrary;
export type ExtractedItem = { text: string; x: number; y: number; size: number; bold: boolean };
export type ExtractedLine = ExtractedItem[];

export async function openPdfForConversion(file: File, signal: AbortSignal, loadRenderer: RendererLoader = loadPdfRenderLibrary) {
  abortIfNeeded(signal);
  if (!file.size) throw new Error('This file is empty. Choose a non-empty PDF.');
  if (file.size > MAX_CONVERT_BYTES) throw new Error('This PDF is larger than 100 MB. Choose a smaller file.');
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') throw new Error('Choose a PDF file to convert.');
  const pdfjs = await loadRenderer();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    if (!pdf.numPages) throw new Error('This PDF has no pages.');
    if (pdf.numPages > MAX_CONVERSION_PAGES) throw new Error(`This browser conversion supports up to ${MAX_CONVERSION_PAGES} pages per file.`);
    return { pdf, close: () => task.destroy().catch(() => undefined) };
  } catch (error) {
    await task.destroy().catch(() => undefined);
    if (error instanceof Error && (error.message.toLowerCase().includes('password') || error.message.toLowerCase().includes('encrypted'))) throw new Error('This PDF is password-protected. Remove its password and try again.');
    throw new Error('We couldn’t process this PDF. Check that it opens normally, then try again.');
  }
}

export async function extractPageLines(pdf: Awaited<ReturnType<typeof openPdfForConversion>>['pdf'], pageNumber: number, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const items: ExtractedItem[] = content.items.flatMap((item) => {
    if (!('str' in item) || !item.str.trim()) return [];
    const [a, b, , , x, y] = item.transform;
    return [{ text: item.str, x, y, size: Math.max(5, Math.hypot(a, b)), bold: /bold|black|heavy/.test(item.fontName.toLowerCase()) }];
  }).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: ExtractedLine[] = [];
  for (const item of items) {
    let line = lines.find((candidate) => Math.abs(candidate[0].y - item.y) < Math.max(2, item.size * 0.4));
    if (!line) { line = []; lines.push(line); }
    line.push(item);
  }
  lines.forEach((line) => line.sort((a, b) => a.x - b.x));
  lines.sort((a, b) => b[0].y - a[0].y);
  return lines;
}

export async function validateOfficeBlob(blob: Blob, kind: keyof typeof OFFICE_MIME) {
  if (blob.size < 200 || blob.type !== OFFICE_MIME[kind]) throw new Error(`The ${kind.toUpperCase()} conversion did not create a usable document. No download was created.`);
  try {
    const zip = await JSZip.loadAsync(blob);
    const required: Record<typeof kind, string[]> = {
      docx: ['[Content_Types].xml', 'word/document.xml'],
      xlsx: ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'],
      pptx: ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/slides/slide1.xml'],
    };
    for (const name of required[kind]) if (!zip.file(name)) throw new Error('A required Office package entry is missing.');
    if (kind === 'docx' && !(await zip.file('word/document.xml')!.async('string')).includes('<w:p')) throw new Error('No Word paragraphs found.');
    if (kind === 'xlsx' && !(await zip.file('xl/worksheets/sheet1.xml')!.async('string')).includes('<row')) throw new Error('No spreadsheet rows found.');
    if (kind === 'pptx') {
      const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
      if (!slide.includes('<p:pic') || !Object.keys(zip.files).some((name) => name.startsWith('ppt/media/'))) throw new Error('Slide artwork is missing.');
    }
  } catch {
    throw new Error(`The ${kind.toUpperCase()} output failed an integrity check. No download was created. Try a different PDF.`);
  }
}

export function officeFileName(file: File, extension: string) { return `${safeBaseName(file.name)}.${extension}`; }
export function abortIfNeeded(signal: AbortSignal) { if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); }
