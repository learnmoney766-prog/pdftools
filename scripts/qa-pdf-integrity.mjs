import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';
import { createCanvas, DOMMatrix, ImageData, loadImage, Path2D } from '@napi-rs/canvas';
import {
  addImageWatermark, addPageNumbers, addWatermark, compressPdfAsImages, extractText, imagesToPdf, makePdfFromPages, makePdfWithoutPages,
  loadPdf, makeZip, mergePdfs, parsePageRanges, readMetadata, renderPagesToImages, rotatePdf, validateFiles,
} from '../src/lib/pdf.ts';
import { pdfToExcel } from '../src/lib/convert-excel.ts';
import { pdfToPowerPoint } from '../src/lib/convert-powerpoint.ts';
import { pdfToWord } from '../src/lib/convert-word.ts';
import { FREE_PRO_STORAGE_KEY, isFreeProActivated, persistFreeProActivation } from '../src/lib/free-pro.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const fixtureDir = path.join(root, 'tests', 'fixtures');
const outDir = path.join(root, 'work', 'pdf-integrity');
await mkdir(outDir, { recursive: true });
const signal = new AbortController().signal;
const input = async (name, type = 'application/pdf') => new File([await readFile(path.join(fixtureDir, name))], name, { type });
const alpha = await input('alpha.pdf');
const beta = await input('beta.pdf');
const gamma = await input('gamma.pdf');
const rangeDoc = await PDFDocument.create();
const rangeFont = await rangeDoc.embedFont(StandardFonts.Helvetica);
for (let number = 1; number <= 10; number += 1) {
  const width = number % 2 ? 612 : 300;
  const height = number % 2 ? 792 : 500;
  const page = rangeDoc.addPage([width, height]);
  page.drawText(`RANGE PAGE ${number}`, { x: 28, y: height - 44, size: 16, font: rangeFont, color: rgb(0, 0, 0) });
  if (number === 4) page.setRotation(degrees(90));
}
const rangeFile = new File([await rangeDoc.save()], 'range source.pdf', { type: 'application/pdf' });
const tinyDoc = await PDFDocument.create();
tinyDoc.addPage([40, 20]);
const tinyFile = new File([await tinyDoc.save()], 'tiny page.pdf', { type: 'application/pdf' });
const smallPageDoc = await PDFDocument.create();
smallPageDoc.addPage([100, 100]);
const smallPageFile = new File([await smallPageDoc.save()], 'small page.pdf', { type: 'application/pdf' });
const emptyFile = await input('empty.pdf');
const corruptedFile = await input('corrupted.pdf');
const watermarkXrefFile = await input('watermark-xref-bug.pdf');
let checks = 0;

const storedValues = new Map();
const fakeStorage = { getItem: (key) => storedValues.get(key) ?? null, setItem: (key, value) => storedValues.set(key, value) };
assert.equal(isFreeProActivated(fakeStorage), false);
assert.equal(persistFreeProActivation(fakeStorage), true);
assert.equal(storedValues.get(FREE_PRO_STORAGE_KEY), 'activated');
assert.equal(isFreeProActivated(fakeStorage), true);
checks += 1;
console.log('PASS Free Pro activation storage: free activation persists across component sessions with no payment state');

assert.throws(() => validateFiles([], 'pdf'), /Choose a file/);
assert.throws(() => validateFiles([emptyFile], 'pdf'), /empty/);
assert.throws(() => validateFiles([new File(['wrong data'], 'wrong.txt', { type: 'text/plain' })], 'pdf'), /not a PDF/);
await assert.rejects(loadPdf(corruptedFile), /could not be opened/);
await assert.rejects(loadPdf(new File(['not a pdf'], 'renamed.pdf', { type: 'application/pdf' })), /could not be opened/);
const abort = new AbortController(); abort.abort();
await assert.rejects(mergePdfs([alpha, beta], abort.signal), (error) => error.name === 'AbortError');
checks += 1;
console.log('PASS input/error guards: empty and corrupted files, spoofed PDF extension, invalid files, and cancellation');

async function verifyPdf(name, blob, pageCount, inspect, expectedText = []) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.ok(bytes.byteLength > 100, `${name}: output is unexpectedly small (${bytes.byteLength} bytes)`);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 5)), '%PDF-', `${name}: PDF header missing`);
  const filename = path.join(outDir, `${name}.pdf`);
  await writeFile(filename, bytes);
  const reopened = await PDFDocument.load(new Uint8Array(await readFile(filename)));
  assert.equal(reopened.getPageCount(), pageCount, `${name}: page count`);
  inspect?.(reopened);
  const task = pdfjs.getDocument({ data: bytes.slice(), disableWorker: true, useSystemFonts: true });
  const independent = await task.promise;
  assert.equal(independent.numPages, pageCount, `${name}: independent PDF.js page count`);
  const text = [];
  for (let number = 1; number <= independent.numPages; number += 1) {
    const page = await independent.getPage(number);
    const content = await page.getTextContent();
    text.push(content.items.flatMap((item) => 'str' in item ? [item.str] : []).join(' '));
  }
  await task.destroy();
  const combinedText = text.join('\n');
  for (const snippet of expectedText) assert.ok(combinedText.includes(snippet), `${name}: missing text ${JSON.stringify(snippet)}`);
  checks += 1;
  console.log(`PASS ${name}: ${bytes.byteLength} bytes, ${reopened.getPageCount()} pages, reopened with pdf-lib and PDF.js`);
  return filename;
}

const merged = await mergePdfs([alpha, beta, gamma], signal);
await verifyPdf('merge-3', merged, 6, (doc) => {
  assert.deepEqual(doc.getPages().map((page) => page.getWidth()), [320, 220, 420, 612, 420, 300]);
  assert.deepEqual(doc.getPages().map((page) => page.getRotation().angle), [0, 0, 0, 0, 0, 90]);
}, ['ALPHA LANDSCAPE PAGE ONE', 'BETA LANDSCAPE PAGE ONE', 'GAMMA PAGE THREE PORTRAIT']);
const mergedMany = await mergePdfs(Array.from({ length: 8 }, () => alpha), signal);
await verifyPdf('merge-8-inputs', mergedMany, 16, undefined, ['ALPHA LANDSCAPE PAGE ONE', 'ALPHA PORTRAIT PAGE TWO']);

const rangeCases = [
  ['split-first-page', '1', [1]],
  ['split-middle-page', '5', [5]],
  ['split-last-page', '10', [10]],
  ['split-simple-range', '1-3', [1, 2, 3]],
  ['split-disjoint-pages', '2,4,6', [2, 4, 6]],
  ['split-multiple-ranges', '1-3,7-9', [1, 2, 3, 7, 8, 9]],
  ['split-overlap-deduplicated', '1-3,2-4,4', [1, 2, 3, 4]],
];
for (const [name, range, pages] of rangeCases) {
  assert.deepEqual(parsePageRanges(range, 10), pages);
  const blob = await makePdfFromPages(rangeFile, pages, signal);
  await verifyPdf(name, blob, pages.length, undefined, pages.map((page) => `RANGE PAGE ${page}`));
}
for (const invalid of ['', '0', '11', '3-2', '1,,3']) assert.throws(() => parsePageRanges(invalid, 10), `invalid range ${invalid}`);
const split = await makePdfFromPages(gamma, [1, 3], signal);
await verifyPdf('extract-pages-1-3', split, 2, (doc) => assert.deepEqual(doc.getPages().map((page) => page.getWidth()), [612, 300]), ['GAMMA PAGE ONE', 'GAMMA PAGE THREE PORTRAIT']);
const extracted = await makePdfFromPages(alpha, [2, 1], signal);
await verifyPdf('extract-reverse', extracted, 2, (doc) => assert.deepEqual(doc.getPages().map((page) => page.getWidth()), [220, 320]), ['ALPHA PORTRAIT PAGE TWO', 'ALPHA LANDSCAPE PAGE ONE']);
await verifyPdf('extract-all', await makePdfFromPages(alpha, [1, 2], signal), 2, undefined, ['ALPHA LANDSCAPE PAGE ONE', 'ALPHA PORTRAIT PAGE TWO']);
const deleted = await makePdfWithoutPages(gamma, [2], signal);
await verifyPdf('delete-middle', deleted, 2, (doc) => assert.deepEqual(doc.getPages().map((page) => page.getWidth()), [612, 300]), ['GAMMA PAGE ONE', 'GAMMA PAGE THREE PORTRAIT']);
await verifyPdf('delete-first', await makePdfWithoutPages(gamma, [1], signal), 2, undefined, ['GAMMA PAGE TWO LANDSCAPE', 'GAMMA PAGE THREE PORTRAIT']);
await verifyPdf('delete-last', await makePdfWithoutPages(gamma, [3], signal), 2, undefined, ['GAMMA PAGE ONE', 'GAMMA PAGE TWO LANDSCAPE']);
await verifyPdf('delete-one-from-two', await makePdfWithoutPages(alpha, [1], signal), 1, undefined, ['ALPHA PORTRAIT PAGE TWO']);
await assert.rejects(makePdfWithoutPages(alpha, [1, 2], signal), /At least one page/);
const reordered = await makePdfFromPages(gamma, [3, 1, 2], signal);
await verifyPdf('reorder-3-1-2', reordered, 3, (doc) => assert.deepEqual(doc.getPages().map((page) => page.getWidth()), [300, 612, 420]), ['GAMMA PAGE THREE PORTRAIT', 'GAMMA PAGE ONE', 'GAMMA PAGE TWO LANDSCAPE']);
const rotated = await rotatePdf(alpha, [1], 90, signal);
await verifyPdf('rotate-selected-90', rotated, 2, (doc) => {
  assert.deepEqual(doc.getPages().map((page) => page.getRotation().angle), [90, 0]);
  assert.deepEqual(doc.getPages().map((page) => page.getWidth()), [320, 220]);
}, ['ALPHA LANDSCAPE PAGE ONE', 'ALPHA PORTRAIT PAGE TWO']);
for (const angle of [180, 270]) {
  const blob = await rotatePdf(alpha, [2], angle, signal);
  await verifyPdf(`rotate-selected-${angle}`, blob, 2, (doc) => assert.deepEqual(doc.getPages().map((page) => page.getRotation().angle), [0, angle]), ['ALPHA LANDSCAPE PAGE ONE', 'ALPHA PORTRAIT PAGE TWO']);
}
const rotated270 = await rotatePdf(gamma, null, 270, signal);
await verifyPdf('rotate-all-270', rotated270, 3, (doc) => assert.deepEqual(doc.getPages().map((page) => page.getRotation().angle), [270, 270, 0]));
const rotatedAll90 = await rotatePdf(gamma, null, 90, signal);
await verifyPdf('rotate-all-90-with-existing-rotation', rotatedAll90, 3, (doc) => assert.deepEqual(doc.getPages().map((page) => page.getRotation().angle), [90, 90, 180]));
const numbers = await addPageNumbers(alpha, 17, 'top', 'right', signal);
await verifyPdf('page-numbers-top-right', numbers, 2, undefined, ['17', '18']);
const zeroNumbers = await addPageNumbers(alpha, 0, 'bottom', 'left', signal);
await verifyPdf('page-numbers-start-zero-bottom-left', zeroNumbers, 2, undefined, ['0', '1']);
const centerNumbers = await addPageNumbers(alpha, 99, 'bottom', 'center', signal);
await verifyPdf('page-numbers-bottom-center', centerNumbers, 2, undefined, ['99', '100']);
await verifyPdf('page-numbers-tiny-page', await addPageNumbers(tinyFile, 99999, 'bottom', 'right', signal), 1, undefined, ['99999']);

const alphaMetadata = await readMetadata(alpha);
assert.equal(alphaMetadata.find(([key]) => key === 'Pages')?.[1], '2');
assert.equal(alphaMetadata.find(([key]) => key === 'Title')?.[1], 'Alpha QA document');
const rangeMetadata = await readMetadata(rangeFile);
assert.equal(rangeMetadata.some(([key]) => key === 'Title' || key === 'Author' || key === 'Subject'), false);
assert.ok(rangeMetadata.some(([key]) => key === 'Pages'));
const richMetadataDoc = await PDFDocument.create();
richMetadataDoc.addPage([612, 792]);
richMetadataDoc.setTitle(`Résumé 世界 — ${'long title '.repeat(8)}`);
richMetadataDoc.setAuthor('QA Author');
richMetadataDoc.setSubject('Unicode metadata test');
richMetadataDoc.setCreator('PDF Toolkit integrity suite');
richMetadataDoc.setCreationDate(new Date('2024-01-02T03:04:05Z'));
const richMetadataFile = new File([await richMetadataDoc.save()], 'rich metadata.pdf', { type: 'application/pdf' });
const richMetadata = await readMetadata(richMetadataFile);
assert.ok(richMetadata.find(([key]) => key === 'Title')?.[1].includes('Résumé 世界'));
assert.equal(richMetadata.find(([key]) => key === 'Author')?.[1], 'QA Author');
assert.ok(richMetadata.some(([key]) => key === 'Created'));
checks += 3;
console.log('PASS PDF page counter and metadata: known page count, optional fields, long Unicode title, and missing fields');

const watermarkCases = [
  ['watermark-basic', 'CONFIDENTIAL', 36, 0.35, 0, 'center', alpha],
  ['watermark-short', 'A', 10, 0.08, 0, 'top-left', gamma],
  ['watermark-long', 'LONG WATERMARK TEXT 1234567890 !?& (DRAFT) - SIGNATURE REQUIRED', 100, 0.7, 45, 'bottom-right', alpha],
  ['watermark-90', 'ROTATED 90', 36, 0.35, 90, 'center', alpha],
  ['watermark-180', 'ROTATED 180', 36, 0.35, 180, 'center', alpha],
  ['watermark-270', 'ROTATED 270', 36, 0.35, 270, 'center', alpha],
  ['watermark-middle-opacity', 'lowercase mixed Case 42', 24, 0.5, -30, 'top-left', gamma],
  ['watermark-ansi-unicode', 'Café € — résumé', 28, 0.4, 15, 'bottom-right', alpha],
];
for (const [name, text, size, opacity, angle, position, file] of watermarkCases) {
  const blob = await addWatermark(file, text, size, opacity, angle, position, signal);
  const expectedText = name === 'watermark-long' ? ['LONG', 'WATERMARK', 'SIGNATURE', 'REQUIRED'] : [text];
  await verifyPdf(name, blob, file === gamma ? 3 : 2, undefined, expectedText);
}
const eightyCharacterWatermark = '1234567890'.repeat(8);
await verifyPdf('watermark-80-chars-large-page', await addWatermark(rangeFile, eightyCharacterWatermark, 100, 0.7, 45, 'center', signal), 10, undefined, ['1234567890']);
await verifyPdf('watermark-repaired-xref-fixture', await addWatermark(watermarkXrefFile, 'AUDIT REGRESSION', 36, 0.4, 45, 'center', signal), 1, undefined, ['Hello World!', 'CONFIDENTIAL', 'AUDIT REGRESSION']);
const watermarkPositions = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];
for (const [index, position] of watermarkPositions.entries()) await verifyPdf(`watermark-position-${index + 1}`, await addWatermark(alpha, `POSITION ${index + 1}`, 22, 0.35, 0, position, signal), 2, undefined, [`POSITION ${index + 1}`]);
await verifyPdf('tiled-text-watermark', await addWatermark(alpha, 'REPEATED REVIEW', 22, 0.2, -32, 'center', signal, { color: '#4a7186', tiled: true }), 2, undefined, ['REPEATED REVIEW']);
await assert.rejects(addWatermark(smallPageFile, 'THIS WATERMARK IS TOO LONG FOR A TINY PAGE', 100, 0.7, 45, 'center', signal), /too long to fit legibly/);

let unsupportedUnicodeError;
try {
  const blob = await addWatermark(alpha, 'Watermark 日本語 😀', 36, 0.4, 0, 'center', signal);
  await verifyPdf('watermark-unsupported-unicode', blob, 2);
} catch (error) {
  unsupportedUnicodeError = error instanceof Error ? error.message : String(error);
  console.log(`LIMIT unsupported Unicode was rejected: ${unsupportedUnicodeError}`);
}

const jpg = await input('sample.jpg', 'image/jpeg');
const png = await input('sample.png', 'image/png');
const imagePdf = await imagesToPdf([jpg, png], 'a4', 'landscape', signal);
await verifyPdf('images-jpg-png-a4-landscape', imagePdf, 2, (doc) => {
  assert.ok(doc.getPages().every((page) => page.getWidth() > page.getHeight()));
});
const oneImage = await imagesToPdf([jpg], 'fit', 'portrait', signal);
await verifyPdf('single-jpg-fit', oneImage, 1, (doc) => assert.ok(doc.getPage(0).getWidth() > doc.getPage(0).getHeight()));
const letterImages = await imagesToPdf([png, jpg], 'letter', 'portrait', signal);
await verifyPdf('png-jpg-letter-portrait', letterImages, 2, (doc) => {
  assert.deepEqual(doc.getPages().map((page) => [page.getWidth(), page.getHeight()]), [[612, 792], [612, 792]]);
});
const oddImage = new File([new Uint8Array(await jpg.arrayBuffer())], 'odd name & résumé (draft).jpg', { type: 'image/jpeg' });
await verifyPdf('odd-name-image-to-pdf', await imagesToPdf([oddImage], 'fit', 'landscape', signal), 1);

const imagePdfBytes = await imagesToPdf([png, jpg], 'fit', 'portrait', signal);
const imageSourceFile = new File([await imagePdfBytes.arrayBuffer()], 'images in pages.pdf', { type: 'application/pdf' });
await verifyPdf('watermark-pdf-containing-images', await addWatermark(imageSourceFile, 'IMAGE REVIEW', 32, 0.3, -30, 'center', signal), 2, undefined, ['IMAGE REVIEW']);

const tableDoc = await PDFDocument.create();
const tableFonts = await Promise.all([StandardFonts.HelveticaBold, StandardFonts.Courier, StandardFonts.TimesRoman].map((fontName) => tableDoc.embedFont(fontName)));
for (const [pageNo, dimensions] of [[1, [612, 792]], [2, [350, 540]]]) {
  const [width, height] = dimensions;
  const page = tableDoc.addPage([width, height]);
  page.drawText(`TABLE PAGE ${pageNo}`, { x: 25, y: height - 40, size: 17, font: tableFonts[0] });
  page.drawText('Item', { x: 25, y: height - 90, size: 12, font: tableFonts[0] });
  page.drawText('Quantity', { x: 190, y: height - 90, size: 12, font: tableFonts[0] });
  page.drawText('Total', { x: 285, y: height - 90, size: 12, font: tableFonts[0] });
  for (let row = 0; row < 4; row += 1) {
    const y = height - 118 - row * 24;
    page.drawText(`Product ${row + 1}`, { x: 25, y, size: 11, font: tableFonts[1] });
    page.drawText(String(row + 2), { x: 190, y, size: 11, font: tableFonts[2] });
    page.drawText(`$${(row + 2) * 12}.00`, { x: 285, y, size: 11, font: tableFonts[1] });
  }
}
const tableFile = new File([await tableDoc.save()], 'table and multiple fonts.pdf', { type: 'application/pdf' });
await verifyPdf('watermark-pdf-containing-tables-fonts-and-mixed-sizes', await addWatermark(tableFile, 'TABLE REVIEW', 31, 0.24, 35, 'center', signal), 2, (doc) => {
  assert.deepEqual(doc.getPages().map((page) => [page.getWidth(), page.getHeight()]), [[612, 792], [350, 540]]);
}, ['TABLE REVIEW']);

const transparentCanvas = createCanvas(24, 24);
Object.assign(globalThis, {
  DOMMatrix, ImageData, Path2D,
  document: { createElement: (name) => name === 'canvas' ? createCanvas(1, 1) : (() => { throw new Error(`Unsupported test element ${name}`); })() },
  createImageBitmap: async (file) => { const image = await loadImage(Buffer.from(await file.arrayBuffer())); image.close = () => undefined; return image; },
});
const transparentContext = transparentCanvas.getContext('2d');
transparentContext.clearRect(0, 0, 24, 24);
transparentContext.fillStyle = '#158575';
transparentContext.globalAlpha = 0.6;
transparentContext.beginPath(); transparentContext.arc(12, 12, 9, 0, Math.PI * 2); transparentContext.fill();
const transparentPng = new File([transparentCanvas.toBuffer('image/png')], 'transparent-logo.png', { type: 'image/png' });
const transparentWatermark = await addImageWatermark(alpha, transparentPng, { opacity: 0.45, size: 90, angle: 22, position: 'center', tiled: false }, signal);
await verifyPdf('transparent-png-image-watermark', transparentWatermark, 2, undefined, ['ALPHA LANDSCAPE PAGE ONE']);
const webpFile = new File([transparentCanvas.toBuffer('image/webp')], 'transparent-logo.webp', { type: 'image/webp' });
const webpWatermark = await addImageWatermark(alpha, webpFile, { opacity: 0.38, size: 80, angle: -10, position: 'top-right', tiled: false }, signal);
await verifyPdf('webp-image-watermark-converted-to-png', webpWatermark, 2, undefined, ['ALPHA LANDSCAPE PAGE ONE']);
const tiledWatermark = await addImageWatermark(alpha, jpg, { opacity: 0.25, size: 72, angle: 0, position: 'center', tiled: true }, signal);
await verifyPdf('tiled-jpg-image-watermark', tiledWatermark, 2, undefined, ['ALPHA LANDSCAPE PAGE ONE']);
const presetWatermark = await addWatermark(alpha, 'DRAFT', 48, 0.3, -35, 'center', signal, { color: '#934735', font: 'TimesRoman', bold: false, outline: true });
await verifyPdf('custom-style-watermark', presetWatermark, 2, undefined, ['DRAFT']);

const progress = [];
const converterInput = await input('alpha.pdf');
const renderer = async () => ({
  ...pdfjs,
  getDocument: (options) => {
    const { standardFontDataUrl: _browserFontUrl, ...nodeOptions } = options;
    return pdfjs.getDocument({ ...nodeOptions, useSystemFonts: true, disableFontFace: false });
  },
});
const extractedText = await extractText(converterInput, signal, (done, total) => progress.push(`text:${done}/${total}`), renderer);
assert.ok(extractedText.includes('ALPHA LANDSCAPE PAGE ONE') && extractedText.includes('ALPHA PORTRAIT PAGE TWO'));
assert.equal(progress.filter((item) => item.startsWith('text:')).length, 2);
checks += 2;
console.log('PASS existing PDF text extractor: two pages of selectable text extracted with page progress');

const pageImages = await renderPagesToImages(converterInput, [1, 2], 'png', 1, 0.9, signal, (done, total) => progress.push(`image:${done}/${total}`), renderer);
assert.equal(pageImages.length, 2);
for (const image of pageImages) {
  const bytes = new Uint8Array(await image.blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
}
const imageZip = await makeZip(pageImages);
const reopenedImageZip = await JSZip.loadAsync(imageZip);
assert.equal(Object.keys(reopenedImageZip.files).filter((name) => name.endsWith('.png')).length, 2);
assert.ok(imageZip.size > 2000);
checks += 3;
console.log(`PASS existing PDF-to-PNG: ${pageImages.length} images rendered with valid PNG signatures and a reopened ZIP`);
const jpgPages = await renderPagesToImages(converterInput, [1], 'jpeg', 1, 0.85, signal, () => undefined, renderer);
const jpgBytes = new Uint8Array(await jpgPages[0].blob.arrayBuffer());
assert.deepEqual([...jpgBytes.slice(0, 3)], [255, 216, 255]);
const jpgZip = await makeZip(jpgPages);
assert.ok(Object.keys((await JSZip.loadAsync(jpgZip)).files).some((name) => name.endsWith('.jpg')));
checks += 2;
console.log('PASS existing PDF-to-JPG: valid JPEG signature and reopened ZIP entry');

const compressedPdf = await compressPdfAsImages(converterInput, 0.72, 0.75, signal, (done, total) => progress.push(`compress:${done}/${total}`), renderer);
await verifyPdf('compressed-alpha-raster-pages', compressedPdf, 2, (doc) => assert.equal(doc.getPageCount(), 2));
console.log(`PASS existing image-based compression: ${compressedPdf.size} bytes, 2-page PDF reopened`);

const word = await pdfToWord(converterInput, signal, (done, total) => progress.push(`word:${done}/${total}`), renderer);
assert.ok(word.blob.size > 200);
assert.ok(word.name.endsWith('.docx'));
const wordZip = await JSZip.loadAsync(word.blob);
assert.ok(wordZip.file('[Content_Types].xml') && wordZip.file('word/document.xml'));
const wordXml = await wordZip.file('word/document.xml').async('string');
assert.ok(wordXml.includes('ALPHA LANDSCAPE PAGE ONE'));
assert.ok(wordXml.includes('ALPHA PORTRAIT PAGE TWO'));
await writeFile(path.join(outDir, word.name), new Uint8Array(await word.blob.arrayBuffer()));
checks += 4;
console.log(`PASS PDF to Word: ${word.blob.size} bytes, ${progress.filter((item) => item.startsWith('word:')).length} pages, DOCX package reopened and text checked`);

const excel = await pdfToExcel(converterInput, signal, (done, total) => progress.push(`excel:${done}/${total}`), renderer);
assert.ok(excel.blob.size > 200);
assert.ok(excel.name.endsWith('.xlsx'));
const workbook = await JSZip.loadAsync(excel.blob);
const workbookXml = await workbook.file('xl/workbook.xml').async('string');
assert.equal((workbookXml.match(/<sheet /g) ?? []).length, 2);
const firstSheetXml = await workbook.file('xl/worksheets/sheet1.xml').async('string');
assert.ok(firstSheetXml.includes('ALPHA LANDSCAPE PAGE ONE'));
await writeFile(path.join(outDir, excel.name), new Uint8Array(await excel.blob.arrayBuffer()));
checks += 4;
console.log(`PASS PDF to Excel: ${excel.blob.size} bytes, ${(workbookXml.match(/<sheet /g) ?? []).length} worksheets reopened with JSZip and cell content checked`);
const tableWorkbookFile = await pdfToExcel(tableFile, signal, () => undefined, renderer);
const tableWorkbook = await JSZip.loadAsync(tableWorkbookFile.blob);
const firstSheetRows = await tableWorkbook.file('xl/worksheets/sheet1.xml').async('string');
assert.ok(firstSheetRows.includes('Item') && firstSheetRows.includes('Quantity') && firstSheetRows.includes('Total'));
assert.ok(firstSheetRows.includes('Product 1'));
await writeFile(path.join(outDir, tableWorkbookFile.name), new Uint8Array(await tableWorkbookFile.blob.arrayBuffer()));
checks += 2;
console.log('PASS PDF table extraction: column-separated headers and product rows recovered into XLSX cells');
await assert.rejects(pdfToWord(imageSourceFile, signal, () => undefined, renderer), /Scanned PDFs need OCR/);
checks += 1;
console.log('PASS scanned PDF Word conversion rejection: clear OCR limitation and no empty DOCX output');

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D, document: { createElement: (name) => name === 'canvas' ? createCanvas(1, 1) : (() => { throw new Error(`Unsupported test element ${name}`); })() } });
const presentation = await pdfToPowerPoint(converterInput, signal, (done, total) => progress.push(`pptx:${done}/${total}`), renderer);
assert.ok(presentation.blob.size > 200);
assert.ok(presentation.name.endsWith('.pptx'));
const pptZip = await JSZip.loadAsync(presentation.blob);
assert.ok(pptZip.file('ppt/presentation.xml'));
const slideEntries = Object.keys(pptZip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
assert.equal(slideEntries.length, 2);
assert.ok(Object.keys(pptZip.files).filter((name) => name.startsWith('ppt/media/')).length >= 2);
await writeFile(path.join(outDir, presentation.name), new Uint8Array(await presentation.blob.arrayBuffer()));
checks += 4;
console.log(`PASS PDF to PowerPoint: ${presentation.blob.size} bytes, ${slideEntries.length} slides, PPTX package reopened and slide images checked`);

console.log(JSON.stringify({ checks, outputDirectory: outDir, unsupportedUnicodeError, officeOutputs: [word.name, excel.name, presentation.name] }, null, 2));
