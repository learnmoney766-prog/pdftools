import ExcelJS from 'exceljs';
import { abortIfNeeded, extractPageLines, officeFileName, openPdfForConversion, OFFICE_MIME, type PageProgress, type RendererLoader, validateOfficeBlob } from './convert-common.ts';

export async function pdfToExcel(file: File, signal: AbortSignal, onProgress: PageProgress, loadRenderer?: RendererLoader) {
  const { pdf, close } = await openPdfForConversion(file, signal, loadRenderer);
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PDF Toolkit';
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      abortIfNeeded(signal);
      const sheet = workbook.addWorksheet(`Page ${pageNo}`);
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
      if (rows.length) {
        const width = Math.max(...rows.map((row) => row.length));
        rows.forEach((row) => sheet.addRow([...row, ...Array(Math.max(0, width - row.length)).fill('')]));
        sheet.columns = Array.from({ length: width }, (_, index) => ({ key: `column${index + 1}`, width: 18 }));
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
      } else sheet.addRow(['No selectable text found on this page']);
      onProgress(pageNo, pdf.numPages);
    }
    const data = await workbook.xlsx.writeBuffer();
    const blob = new Blob([data as BlobPart], { type: OFFICE_MIME.xlsx });
    await validateOfficeBlob(blob, 'xlsx');
    return { name: officeFileName(file, 'xlsx'), blob };
  } finally { await close(); }
}
