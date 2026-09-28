import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  addPageNumbers, addWatermark, imagesToPdf, makePdfFromPages, makePdfWithoutPages,
  loadPdf, mergePdfs, parsePageRanges, readMetadata, rotatePdf, validateFiles,
} from '../src/lib/pdf.ts';

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
  const task = pdfjs.getDocument({ data: bytes.slice(), disableWorker: true, useSystemFonts: true, disableFontFace: true });
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

console.log(JSON.stringify({ checks, outputDirectory: outDir, unsupportedUnicodeError }, null, 2));
