import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PDFDocument as PdfDocumentType } from 'pdf-lib';
import { pdfJsDocumentOptions } from './pdfjs-options.ts';

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BATCH_BYTES = 100 * 1024 * 1024;
export const MAX_BATCH_FILES = 30;
export const MAX_RENDER_PAGES = 80;
export const MAX_CONVERSION_PAGES = 40;
export const MAX_COMPRESSION_PAGES = 40;
export const MAX_TEXT_PAGES = 300;

export function validateFiles(files: File[], kind: 'pdf' | 'jpg' | 'png') {
  if (files.length === 0) throw new Error('Choose a file to get started.');
  if (files.length > MAX_BATCH_FILES) throw new Error(`Choose ${MAX_BATCH_FILES} files or fewer at a time.`);
  if (kind !== 'pdf' && files.reduce((total, file) => total + file.size, 0) > MAX_IMAGE_BATCH_BYTES) throw new Error('Keep the total image selection under 100 MB to leave room for browser processing.');
  for (const file of files) {
    if (file.size === 0) throw new Error(`“${file.name}” is empty. Choose a different file.`);
    const limit = kind === 'pdf' ? MAX_FILE_BYTES : MAX_IMAGE_BYTES;
    if (file.size > limit) throw new Error(`“${file.name}” is larger than ${kind === 'pdf' ? '100' : '25'} MB. Try a smaller file.`);
    const name = file.name.toLowerCase();
    const valid = kind === 'pdf'
      ? name.endsWith('.pdf') || file.type === 'application/pdf'
      : kind === 'jpg'
        ? /\.(jpe?g)$/.test(name) || ['image/jpeg', 'image/jpg'].includes(file.type)
        : name.endsWith('.png') || file.type === 'image/png';
    if (!valid) {
      const label = kind === 'pdf' ? 'PDF' : kind === 'jpg' ? 'JPG or JPEG image' : 'PNG image';
      throw new Error(`“${file.name}” is not a ${label}. Choose a supported file.`);
    }
  }
}

export function explainPdfError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('winansi cannot encode')) return 'This watermark contains a character the built-in PDF font cannot represent. Try plain Latin or Western European text.';
    if (message.includes('failed an integrity check')) return error.message;
    if (message.includes('encrypted') || message.includes('password')) return 'This PDF is password-protected. Remove the password in a trusted PDF app and try again.';
    if (message.includes('invalid pdf') || message.includes('no pdf header') || message.includes('startxref') || message.includes('parsing')) return 'This file could not be read as a PDF. It may be damaged or use an unsupported format.';
    if (error.name === 'TypeError' || error.name === 'ReferenceError' || /invalid pdf structure|xref|unexpected eof|cannot read properties/.test(message)) return 'This PDF could not be read. It may be damaged or use an unsupported format.';
    if (message.includes('out of memory') || message.includes('memory')) return 'Your browser ran out of memory while processing this file. Try a smaller PDF or fewer pages.';
    return error.message;
  }
  return 'The file could not be processed. Please try another file.';
}

export async function loadPdf(file: File): Promise<PdfDocumentType> {
  try {
    const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));
    if (doc.getPageCount() === 0) throw new Error('The PDF has no pages.');
    return doc;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('encrypted') || message.includes('password')) throw new Error('This PDF is password-protected and cannot be opened here.');
    throw new Error('This file could not be opened as a PDF. It may be damaged, encrypted, or use an unsupported format.');
  }
}

export async function loadPdfRenderLibrary() {
  const renderer = await import('./renderer');
  return renderer.loadPdfRenderLibrary();
}

export function parsePageRanges(input: string, total: number): number[] {
  const value = input.trim();
  if (!value) throw new Error('Enter at least one page number or range.');
  if (!/^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/.test(value)) {
    throw new Error('Use page numbers and ranges such as 1-3, 7, 9-10.');
  }
  const result = new Set<number>();
  for (const part of value.split(',')) {
    const [firstText, lastText] = part.split('-').map((item) => item.trim());
    const first = Number(firstText);
    const last = lastText === undefined ? first : Number(lastText);
    if (first < 1 || last < 1 || first > total || last > total) throw new Error(`Page numbers must be between 1 and ${total}.`);
    if (last < first) throw new Error(`Range ${first}-${last} runs backwards. Put the smaller page number first.`);
    for (let page = first; page <= last; page += 1) result.add(page);
  }
  return [...result].sort((a, b) => a - b);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function safeBaseName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().slice(0, 80) || 'document';
}

export async function savePdf(doc: PdfDocumentType) {
  const expectedPages = doc.getPageCount();
  let bytes: Uint8Array;
  try {
    if (expectedPages < 1) throw new Error('A PDF must contain at least one page');
    // Rebuild the document graph before serialization. pdf-lib can recover a
    // malformed source xref stream by scanning objects, but saving that loaded
    // document directly can preserve inconsistent cross-reference counts.
    // Copying its pages into a fresh context creates a clean catalog and xref.
    const clean = await PDFDocument.create();
    const copiedPages = await clean.copyPages(doc, doc.getPageIndices());
    copiedPages.forEach((page) => clean.addPage(page));
    bytes = new Uint8Array(await clean.save({ useObjectStreams: false }));
    if (bytes.byteLength < 100 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('Invalid output structure');
    const reopened = await PDFDocument.load(new Uint8Array(bytes));
    if (reopened.getPageCount() !== expectedPages) throw new Error('Unexpected output page count');
  } catch {
    throw new Error('The generated PDF failed an integrity check. No download was created. Try a different PDF or fewer pages.');
  }
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export async function mergePdfs(files: File[], signal: AbortSignal) {
  const output = await PDFDocument.create();
  for (const file of files) {
    assertActive(signal);
    const source = await loadPdf(file);
    const pages = await output.copyPages(source, source.getPageIndices());
    for (const page of pages) output.addPage(page);
  }
  assertActive(signal);
  return savePdf(output);
}

export async function makePdfFromPages(file: File, selected: number[], signal: AbortSignal) {
  const source = await loadPdf(file);
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, selected.map((page) => page - 1));
  assertActive(signal);
  pages.forEach((page) => output.addPage(page));
  return savePdf(output);
}

export async function makePdfWithoutPages(file: File, removed: number[], signal: AbortSignal) {
  const source = await loadPdf(file);
  const keep = source.getPageIndices().filter((index) => !removed.includes(index + 1));
  if (keep.length === 0) throw new Error('At least one page must remain in the new PDF.');
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, keep);
  assertActive(signal);
  pages.forEach((page) => output.addPage(page));
  return savePdf(output);
}

export async function rotatePdf(file: File, selected: number[] | null, rotation: number, signal: AbortSignal) {
  const doc = await loadPdf(file);
  const targets = selected ? new Set(selected) : null;
  doc.getPages().forEach((page, index) => {
    if (!targets || targets.has(index + 1)) page.setRotation(degrees(((page.getRotation().angle + rotation) % 360 + 360) % 360));
  });
  assertActive(signal);
  return savePdf(doc);
}

export async function imagesToPdf(files: File[], pageSize: 'fit' | 'a4' | 'letter', orientation: 'portrait' | 'landscape', signal: AbortSignal) {
  const doc = await PDFDocument.create();
  for (const file of files) {
    assertActive(signal);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const image = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    let width = image.width;
    let height = image.height;
    if (pageSize !== 'fit') {
      [width, height] = pageSize === 'a4' ? [595.28, 841.89] : [612, 792];
      if (orientation === 'landscape') [width, height] = [height, width];
    }
    const page = doc.addPage([width, height]);
    const scale = Math.min(width / image.width, height / image.height);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    page.drawImage(image, { x: (width - imageWidth) / 2, y: (height - imageHeight) / 2, width: imageWidth, height: imageHeight });
  }
  assertActive(signal);
  return savePdf(doc);
}

export async function readMetadata(file: File) {
  const doc = await loadPdf(file);
  try {
    const fields: [string, string | undefined][] = [
      ['Title', doc.getTitle()], ['Author', doc.getAuthor()], ['Subject', doc.getSubject()],
      ['Creator', doc.getCreator()], ['Producer', doc.getProducer()], ['Keywords', doc.getKeywords()],
      ['Created', formatDate(doc.getCreationDate())], ['Modified', formatDate(doc.getModificationDate())],
      ['Pages', String(doc.getPageCount())], ['File size', formatBytes(file.size)],
    ];
    return fields.flatMap(([key, value]) => value?.trim() ? [[key, value] as [string, string]] : []);
  } catch {
    throw new Error('This PDF could not be read. It may be damaged or use an unsupported format.');
  }
}

export async function extractText(file: File, signal: AbortSignal, onProgress: (page: number, total: number) => void, loadRenderer: typeof loadPdfRenderLibrary = loadPdfRenderLibrary) {
  const pdfjs = await loadRenderer();
  const data = new Uint8Array(await file.arrayBuffer());
  const loading = pdfjs.getDocument(pdfJsDocumentOptions(data));
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > MAX_TEXT_PAGES) throw new Error(`This PDF has ${pdf.numPages} pages. Text extraction is limited to ${MAX_TEXT_PAGES} pages at a time.`);
    const output: string[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      assertActive(signal);
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const parts = content.items.flatMap((item) => 'str' in item ? [item.str] : []);
      output.push(parts.join(' '));
      onProgress(number, pdf.numPages);
    }
    return output.join('\n\n');
  } finally {
    await loading.destroy().catch(() => undefined);
  }
}

export async function renderPagesToImages(file: File, pages: number[], format: 'jpeg' | 'png', scale: number, quality: number, signal: AbortSignal, onProgress: (page: number, total: number) => void, loadRenderer: typeof loadPdfRenderLibrary = loadPdfRenderLibrary) {
  const pdfjs = await loadRenderer();
  const loading = pdfjs.getDocument(pdfJsDocumentOptions(new Uint8Array(await file.arrayBuffer())));
  try {
    const pdf = await loading.promise;
    if (pages.length > MAX_CONVERSION_PAGES) throw new Error(`Choose ${MAX_CONVERSION_PAGES} pages or fewer for this browser conversion.`);
    const images: { name: string; blob: Blob }[] = [];
    for (let index = 0; index < pages.length; index += 1) {
      assertActive(signal);
      const number = pages[index];
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('This browser could not create an image canvas. Try a different browser.');
      await page.render({ canvas, canvasContext: context, viewport, background: 'rgb(255,255,255)' }).promise;
      const blob = await canvasToBlob(canvas, format === 'jpeg' ? 'image/jpeg' : 'image/png', quality);
      canvas.width = 0;
      canvas.height = 0;
      images.push({ name: `page-${String(number).padStart(3, '0')}.${format === 'jpeg' ? 'jpg' : 'png'}`, blob });
      onProgress(index + 1, pages.length);
    }
    return images;
  } finally {
    await loading.destroy().catch(() => undefined);
  }
}

export async function compressPdfAsImages(file: File, quality: number, scale: number, signal: AbortSignal, onProgress: (page: number, total: number) => void, loadRenderer: typeof loadPdfRenderLibrary = loadPdfRenderLibrary) {
  const pdfjs = await loadRenderer();
  const loading = pdfjs.getDocument(pdfJsDocumentOptions(new Uint8Array(await file.arrayBuffer())));
  try {
    const source = await loading.promise;
    if (source.numPages > MAX_COMPRESSION_PAGES) throw new Error(`This browser-based compressor supports up to ${MAX_COMPRESSION_PAGES} pages at a time.`);
    const output = await PDFDocument.create();
    for (let number = 1; number <= source.numPages; number += 1) {
      assertActive(signal);
      const page = await source.getPage(number);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('This browser could not create an image canvas. Try a different browser.');
      await page.render({ canvas, canvasContext: context, viewport, background: 'rgb(255,255,255)' }).promise;
      const jpg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', quality)).arrayBuffer());
      canvas.width = 0;
      canvas.height = 0;
      const embedded = await output.embedJpg(jpg);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const width = unscaledViewport.width;
      const height = unscaledViewport.height;
      output.addPage([width, height]).drawImage(embedded, { x: 0, y: 0, width, height });
      onProgress(number, source.numPages);
    }
    assertActive(signal);
    return savePdf(output);
  } finally {
    await loading.destroy().catch(() => undefined);
  }
}

export async function addPageNumbers(file: File, start: number, position: 'top' | 'bottom', align: 'left' | 'center' | 'right', signal: AbortSignal) {
  const doc = await loadPdf(file);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.getPages().forEach((page, index) => {
    const { width, height } = page.getSize();
    let size = 10;
    const text = String(start + index);
    let textWidth = font.widthOfTextAtSize(text, size);
    const initialMargin = Math.min(32, width * 0.1);
    const availableWidth = width - initialMargin * 2;
    if (textWidth > availableWidth) size *= availableWidth / textWidth;
    if (size < 6) throw new Error('This page is too small to fit the page number legibly.');
    textWidth = font.widthOfTextAtSize(text, size);
    const textHeight = font.heightAtSize(size);
    const marginX = Math.min(32, Math.max(0, (width - textWidth) / 2));
    const marginY = Math.min(18, Math.max(0, (height - textHeight) / 2));
    const x = align === 'left' ? marginX : align === 'right' ? width - textWidth - marginX : (width - textWidth) / 2;
    const y = position === 'top' ? height - textHeight - marginY : marginY;
    page.drawText(text, { x, y, size, font, color: rgb(0.24, 0.31, 0.34) });
  });
  assertActive(signal);
  return savePdf(doc);
}

export type WatermarkPosition = 'center' | 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'header' | 'footer';
export type TextWatermarkOptions = { color?: string; font?: 'Helvetica' | 'TimesRoman' | 'Courier'; bold?: boolean; tiled?: boolean; outline?: boolean };

function parseHexColor(value: string) {
  const hex = value.replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error('Choose a valid six-digit watermark color.');
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
}

export async function addWatermark(file: File, text: string, size: number, opacity: number, angle: number, position: WatermarkPosition, signal: AbortSignal, options: TextWatermarkOptions = {}) {
  const doc = await loadPdf(file);
  const fontKey = options.font === 'TimesRoman' ? (options.bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman)
    : options.font === 'Courier' ? (options.bold ? StandardFonts.CourierBold : StandardFonts.Courier)
      : (options.bold === false ? StandardFonts.Helvetica : StandardFonts.HelveticaBold);
  const font = await doc.embedFont(fontKey);
  const label = text.replace(/\s+/g, ' ').trim();
  if (!label) throw new Error('Enter watermark text before applying it.');
  if (label.length > 80) throw new Error('Watermark text can contain up to 80 characters.');
  if (!Number.isFinite(size) || size < 1 || !Number.isFinite(opacity) || opacity < 0 || opacity > 1 || !Number.isFinite(angle)) throw new Error('Check the watermark size, opacity, and rotation values.');
  const color = parseHexColor(options.color ?? '#3d616e');
  doc.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    try { font.widthOfTextAtSize(label, size); }
    catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('winansi cannot encode')) throw new Error('This watermark contains a character the built-in PDF font cannot represent. Try plain Latin or Western European text.');
      throw error;
    }
    const margin = Math.min(24, Math.max(0, Math.min(width, height) * 0.08));
    const availableWidth = width - margin * 2;
    const availableHeight = height - margin * 2;
    const radians = angle * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const boundsAt = (fontSize: number) => {
      const lineWidth = font.widthOfTextAtSize(label, fontSize);
      const lineHeight = font.heightAtSize(fontSize);
      const corners = [[0, 0], [lineWidth * cosine, lineWidth * sine], [-lineHeight * sine, lineHeight * cosine], [lineWidth * cosine - lineHeight * sine, lineWidth * sine + lineHeight * cosine]];
      const xs = corners.map(([x]) => x);
      const ys = corners.map(([, y]) => y);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    };
    const originalBounds = boundsAt(size);
    const fitScale = Math.min(1, availableWidth / (originalBounds.maxX - originalBounds.minX), availableHeight / (originalBounds.maxY - originalBounds.minY));
    const fittedSize = size * fitScale;
    if (fittedSize < 6) throw new Error('This watermark is too long to fit legibly on every page. Shorten the text or use a smaller font size.');
    const bounds = boundsAt(fittedSize);
    const boxWidth = bounds.maxX - bounds.minX;
    const boxHeight = bounds.maxY - bounds.minY;
    const horizontal = position.includes('left') ? 'left' : position.includes('right') ? 'right' : 'center';
    const vertical = position === 'header' || position.startsWith('top-') ? 'top' : position === 'footer' || position.startsWith('bottom-') ? 'bottom' : 'center';
    const centerX = horizontal === 'left' ? margin + boxWidth / 2 : horizontal === 'right' ? width - margin - boxWidth / 2 : width / 2;
    const centerY = vertical === 'top' ? height - margin - boxHeight / 2 : vertical === 'bottom' ? margin + boxHeight / 2 : height / 2;
    const baseX = centerX - (bounds.minX + bounds.maxX) / 2;
    const baseY = centerY - (bounds.minY + bounds.maxY) / 2;
    const draw = (x: number, y: number, opacityScale = 1) => page.drawText(label, { x, y, size: fittedSize, font, color, opacity: opacity * opacityScale, rotate: degrees(angle) });
    if (options.tiled) {
      const stepX = Math.max(boxWidth + fittedSize * 2.2, 110);
      const stepY = Math.max(boxHeight + fittedSize * 2.4, 90);
      const rows = Math.min(18, Math.ceil(height / stepY));
      const columns = Math.min(18, Math.ceil(width / stepX));
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) draw(column * stepX + margin, row * stepY + margin, 0.72);
      }
    } else if (options.outline) {
      const offset = Math.max(0.45, fittedSize / 45);
      for (const [dx, dy] of [[-offset, 0], [offset, 0], [0, -offset], [0, offset]] as const) draw(baseX + dx, baseY + dy, 0.25);
      draw(baseX, baseY, 0.72);
    } else draw(baseX, baseY);
  });
  assertActive(signal);
  return savePdf(doc);
}

export type ImageWatermarkOptions = { opacity: number; size: number; angle: number; position: WatermarkPosition; tiled: boolean };

async function readWatermarkImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) throw new Error('Choose a PNG, JPG, JPEG, or WEBP image for the watermark.');
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new Error('The watermark image must be non-empty and no larger than 25 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) return { bytes, format: 'png' as const };
  if (file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)) return { bytes, format: 'jpg' as const };
  const source = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the watermark image.');
    context.drawImage(source, 0, 0);
    const blob = await canvasToBlob(canvas, 'image/png', 1);
    canvas.width = 0; canvas.height = 0;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), format: 'png' as const };
  } finally { source.close(); }
}

export async function addImageWatermark(file: File, imageFile: File, options: ImageWatermarkOptions, signal: AbortSignal) {
  const doc = await loadPdf(file);
  const imageData = await readWatermarkImage(imageFile);
  const image = imageData.format === 'jpg' ? await doc.embedJpg(imageData.bytes) : await doc.embedPng(imageData.bytes);
  if (!Number.isFinite(options.opacity) || options.opacity < 0 || options.opacity > 1 || !Number.isFinite(options.size) || options.size < 1 || !Number.isFinite(options.angle)) throw new Error('Check the image watermark size, opacity, and rotation values.');
  doc.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    const imageWidth = Math.min(width * 0.8, options.size);
    const imageHeight = imageWidth * image.height / image.width;
    const x = options.position.includes('left') ? 18 : options.position.includes('right') ? width - imageWidth - 18 : (width - imageWidth) / 2;
    const y = options.position === 'header' || options.position.startsWith('top-') ? height - imageHeight - 18
      : options.position === 'footer' || options.position.startsWith('bottom-') ? 18 : (height - imageHeight) / 2;
    if (options.tiled) {
      const stepX = Math.max(imageWidth + 80, 130); const stepY = Math.max(imageHeight + 80, 120);
      const rows = Math.min(18, Math.ceil(height / stepY)); const columns = Math.min(18, Math.ceil(width / stepX));
      for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
        const tileY = row * stepY; const tileX = column * stepX;
        page.drawImage(image, { x: tileX, y: tileY, width: Math.min(imageWidth, width - tileX), height: Math.min(imageHeight, height - tileY), opacity: options.opacity * 0.72, rotate: degrees(options.angle) });
      }
    } else page.drawImage(image, { x, y, width: imageWidth, height: imageHeight, opacity: options.opacity, rotate: degrees(options.angle) });
  });
  assertActive(signal);
  return savePdf(doc);
}

export async function makeZip(files: { name: string; blob: Blob }[]) {
  if (files.length === 0) throw new Error('No page images were created. Select at least one page and try again.');
  const names = files.map((file) => file.name);
  if (new Set(names).size !== names.length) throw new Error('The page image filenames were not unique. Try a different selection.');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  files.forEach((file) => zip.file(file.name, file.blob));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  try {
    const reopened = await JSZip.loadAsync(blob);
    const actualNames = Object.keys(reopened.files).filter((name) => !reopened.files[name].dir).sort();
    if (actualNames.join('\0') !== [...names].sort().join('\0')) throw new Error('ZIP entries did not match.');
    for (const source of files) {
      const entry = reopened.file(source.name);
      if (!entry) throw new Error('ZIP entry is missing.');
      const bytes = await entry.async('uint8array');
      if (bytes.byteLength !== source.blob.size || bytes.byteLength === 0) throw new Error('ZIP entry size did not match.');
      if (source.name.toLowerCase().endsWith('.jpg') || source.name.toLowerCase().endsWith('.jpeg')) {
        if (source.blob.type !== 'image/jpeg' || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error('Invalid JPEG image data.');
      } else if (source.name.toLowerCase().endsWith('.png')) {
        const signature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (source.blob.type !== 'image/png' || signature.some((value, index) => bytes[index] !== value) || new TextDecoder().decode(bytes.slice(-8, -4)) !== 'IEND') throw new Error('Invalid PNG image data.');
      }
    }
  } catch {
    throw new Error('The image archive failed an integrity check. No download was created. Please convert the pages again.');
  }
  return blob;
}

export async function getPagePreviews(file: File, signal: AbortSignal, onProgress: (page: number, total: number) => void) {
  const pdfjs = await loadPdfRenderLibrary();
  const loading = pdfjs.getDocument(pdfJsDocumentOptions(new Uint8Array(await file.arrayBuffer())));
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > MAX_RENDER_PAGES) return { count: pdf.numPages, previews: [] as { page: number; url: string }[] };
    const previews: { page: number; url: string }[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      assertActive(signal);
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: Math.min(0.24, 112 / page.getViewport({ scale: 1 }).width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('This browser could not create page previews.');
      await page.render({ canvas, canvasContext: context, viewport, background: 'rgb(255,255,255)' }).promise;
      previews.push({ page: number, url: canvas.toDataURL('image/webp', 0.6) });
      canvas.width = 0;
      canvas.height = 0;
      onProgress(number, pdf.numPages);
    }
    return { count: pdf.numPages, previews };
  } finally {
    await loading.destroy().catch(() => undefined);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob || blob.size === 0) { reject(new Error('The browser could not create an image from this page.')); return; }
    if (blob.type !== type) { reject(new Error(`This browser could not encode ${type} images. Try a different browser or output format.`)); return; }
    resolve(blob);
  }, type, quality));
}

function formatDate(date: Date | undefined) {
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : undefined;
}

export function assertActive(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
}
