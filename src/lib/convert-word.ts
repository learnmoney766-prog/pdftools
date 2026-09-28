import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { abortIfNeeded, extractPageLines, officeFileName, openPdfForConversion, type PageProgress, type RendererLoader, validateOfficeBlob } from './convert-common.ts';

export async function pdfToWord(file: File, signal: AbortSignal, onProgress: PageProgress, loadRenderer?: RendererLoader) {
  const { pdf, close } = await openPdfForConversion(file, signal, loadRenderer);
  try {
    const paragraphs: Paragraph[] = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      abortIfNeeded(signal);
      const lines = await extractPageLines(pdf, pageNo, signal);
      let pageHasText = false;
      for (const line of lines) {
        const text = line.map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const averageSize = line.reduce((sum, item) => sum + item.size, 0) / line.length;
        const heading = averageSize > 16 && text.length < 100;
        paragraphs.push(new Paragraph({
          pageBreakBefore: pageNo > 1 && !pageHasText,
          heading: heading ? HeadingLevel.HEADING_2 : undefined,
          spacing: { after: 100 },
          children: line.map((item, index) => new TextRun({ text: `${index ? ' ' : ''}${item.text}`, bold: item.bold || (heading && item.size > averageSize), size: Math.round(Math.min(36, Math.max(16, item.size * 1.5))), font: 'Arial' })),
        }));
        pageHasText = true;
      }
      onProgress(pageNo, pdf.numPages);
    }
    if (!paragraphs.length) throw new Error('No selectable text was found. Scanned PDFs need OCR before they can be converted to editable Word text.');
    const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    await validateOfficeBlob(blob, 'docx');
    return { name: officeFileName(file, 'docx'), blob };
  } finally { await close(); }
}
