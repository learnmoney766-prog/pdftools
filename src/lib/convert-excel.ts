import JSZip from 'jszip';
import { abortIfNeeded, extractPageLines, officeFileName, openPdfForConversion, OFFICE_MIME, type PageProgress, type RendererLoader, validateOfficeBlob } from './convert-common.ts';

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export async function pdfToExcel(file: File, signal: AbortSignal, onProgress: PageProgress, loadRenderer?: RendererLoader) {
  const { pdf, close } = await openPdfForConversion(file, signal, loadRenderer);
  try {
    const zip = new JSZip();
    const worksheets: string[] = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      abortIfNeeded(signal);
      const lines = await extractPageLines(pdf, pageNo, signal);
      const rows: string[][] = [];
      for (const line of lines) {
        const cells: string[] = [];
        let lastX = Number.NEGATIVE_INFINITY;
        let current = '';
        for (const item of line) {
          const gap = item.x - lastX;
          if (current && gap > Math.max(32, item.size * 2.4)) { cells.push(current.trim()); current = ''; }
          current += `${current ? ' ' : ''}${item.text}`;
          lastX = item.x + item.text.length * item.size * 0.45;
        }
        if (current.trim()) cells.push(current.trim());
        if (cells.length) rows.push(cells);
      }
      if (!rows.length) rows.push(['No selectable text found on this page']);
      const width = Math.max(...rows.map((row) => row.length));
      const rowXml = rows.map((row, rowIndex) => {
        const cells = Array.from({ length: width }, (_, columnIndex) => {
          const value = row[columnIndex] ?? '';
          if (!value) return '';
          const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        }).join('');
        return `<row r="${rowIndex + 1}">${cells}</row>`;
      }).join('');
      const columns = Array.from({ length: width }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="18" customWidth="1"/>`).join('');
      zip.file(`xl/worksheets/sheet${pageNo}.xml`, `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${rowXml}</sheetData></worksheet>`);
      worksheets.push(`<sheet name="Page ${pageNo}" sheetId="${pageNo}" r:id="rId${pageNo}"/>`);
      onProgress(pageNo, pdf.numPages);
    }
    zip.file('[Content_Types].xml', `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${Array.from({ length: pdf.numPages }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    zip.file('_rels/.rels', `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file('xl/workbook.xml', `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${worksheets.join('')}</sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({ length: pdf.numPages }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`);
    const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const blob = new Blob([data.slice().buffer as ArrayBuffer], { type: OFFICE_MIME.xlsx });
    await validateOfficeBlob(blob, 'xlsx');
    return { name: officeFileName(file, 'xlsx'), blob };
  } finally { await close(); }
}

function columnName(number: number) {
  let result = '';
  while (number > 0) {
    number -= 1;
    result = String.fromCharCode(65 + number % 26) + result;
    number = Math.floor(number / 26);
  }
  return result;
}

function escapeXml(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
