import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clipboard, Info, Image as ImageIcon, LoaderCircle, ShieldCheck, Sparkles, Unlock } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toolBySlug, toolHref } from '../data/tools';
import type { ToolSpec } from '../data/tools';
import {
  addImageWatermark, addPageNumbers, addWatermark, compressPdfAsImages, extractText, formatBytes, imagesToPdf,
  makePdfFromPages, makePdfWithoutPages, makeZip, mergePdfs, parsePageRanges,
  readMetadata, renderPagesToImages, rotatePdf, safeBaseName,
  MAX_COMPRESSION_PAGES, MAX_CONVERSION_PAGES, MAX_RENDER_PAGES, validateFiles,
} from '../lib/pdf';
import type { TextWatermarkOptions, WatermarkPosition } from '../lib/pdf';
import { isFreeProActivated, persistFreeProActivation } from '../lib/free-pro';
import {
  FileDropZone, FileListEditor, OutputCard, PDFPageSelector, PrivacyNote, ResetButton,
  StatusMessage, useToolProcessor,
} from '../components/ToolParts';
import type { ToolOutput } from '../components/ToolParts';
import type { ReactNode } from 'react';
import { useSeo } from '../useSeo';

function slugForTitle(title: string) { return `${title} | PDF Toolkit`; }

const watermarkStyles: { id: string; label: string; text: string; size: number; opacity: number; angle: number; position: WatermarkPosition; color: string; font: TextWatermarkOptions['font']; bold: boolean; tiled?: boolean; outline?: boolean }[] = [
  { id: 'classic', label: 'Classic', text: 'CONFIDENTIAL', size: 36, opacity: .28, angle: 0, position: 'center', color: '#496d70', font: 'TimesRoman', bold: true },
  { id: 'minimal', label: 'Minimal', text: 'PRIVATE', size: 15, opacity: .3, angle: 0, position: 'bottom-right', color: '#758783', font: 'Helvetica', bold: false },
  { id: 'bold', label: 'Bold', text: 'OFFICIAL', size: 64, opacity: .3, angle: 0, position: 'center', color: '#263f55', font: 'Helvetica', bold: true },
  { id: 'modern', label: 'Modern', text: 'PREVIEW', size: 28, opacity: .55, angle: -25, position: 'center', color: '#198675', font: 'Helvetica', bold: true },
  { id: 'elegant', label: 'Elegant', text: 'COPY', size: 45, opacity: .35, angle: -35, position: 'center', color: '#996d84', font: 'TimesRoman', bold: false },
  { id: 'confidential', label: 'Confidential', text: 'CONFIDENTIAL', size: 42, opacity: .48, angle: -35, position: 'center', color: '#8a3434', font: 'Helvetica', bold: true },
  { id: 'draft', label: 'Draft', text: 'DRAFT', size: 58, opacity: .26, angle: -35, position: 'center', color: '#9b5e30', font: 'Helvetica', bold: true },
  { id: 'copy', label: 'Copy', text: 'COPY', size: 32, opacity: .4, angle: 0, position: 'top-left', color: '#8c3e3e', font: 'Courier', bold: true },
  { id: 'preview', label: 'Preview', text: 'PREVIEW', size: 24, opacity: .34, angle: 0, position: 'header', color: '#657b8a', font: 'Helvetica', bold: false },
  { id: 'sample', label: 'Sample', text: 'SAMPLE', size: 42, opacity: .3, angle: -20, position: 'center', color: '#896d28', font: 'TimesRoman', bold: true },
  { id: 'protected', label: 'Protected', text: 'PROTECTED', size: 34, opacity: .3, angle: -30, position: 'center', color: '#40528c', font: 'Courier', bold: true },
  { id: 'diagonal', label: 'Diagonal', text: 'CONFIDENTIAL', size: 44, opacity: .24, angle: -45, position: 'center', color: '#4e7778', font: 'Helvetica', bold: true },
  { id: 'large', label: 'Large center', text: 'COPY', size: 78, opacity: .22, angle: 0, position: 'center', color: '#54717a', font: 'Helvetica', bold: true },
  { id: 'corner', label: 'Small corner', text: 'INTERNAL', size: 16, opacity: .55, angle: 0, position: 'bottom-right', color: '#397c68', font: 'Courier', bold: true },
  { id: 'pattern', label: 'Repeated pattern', text: 'SAMPLE', size: 24, opacity: .18, angle: -35, position: 'center', color: '#577f88', font: 'Helvetica', bold: true, tiled: true },
  { id: 'header', label: 'Header', text: 'COMPANY NAME', size: 18, opacity: .5, angle: 0, position: 'header', color: '#2d8478', font: 'Helvetica', bold: true },
  { id: 'footer', label: 'Footer', text: 'CONTROLLED COPY', size: 14, opacity: .55, angle: 0, position: 'footer', color: '#6d7774', font: 'Courier', bold: false },
  { id: 'stamp', label: 'Stamp', text: 'APPROVED', size: 35, opacity: .68, angle: -12, position: 'center', color: '#328064', font: 'Courier', bold: true, outline: true },
  { id: 'outline', label: 'Outline', text: 'PREVIEW', size: 40, opacity: .36, angle: 0, position: 'center', color: '#3775a0', font: 'Helvetica', bold: true, outline: true },
  { id: 'light', label: 'Light', text: 'CONFIDENTIAL', size: 36, opacity: .12, angle: -30, position: 'center', color: '#6a99a7', font: 'Helvetica', bold: false },
];

export function ToolRoute() {
  const { slug } = useParams();
  const tool = toolBySlug(slug);
  if (!tool) return <NotFound />;
  return <ToolPage tool={tool} />;
}

function ToolPage({ tool }: { tool: ToolSpec }) {
  useSeo(slugForTitle(tool.title), tool.description, `/${tool.slug}`);
  return <main className="page-shell tool-page">
    <div className="tool-intro">
      <div className="breadcrumbs"><Link to="/">Home</Link><span aria-hidden="true">/</span><a href="/#tools">{tool.category}</a></div>
      <span className="eyebrow">{tool.category}</span>
      <h1>{tool.title}</h1>
      <p>{tool.intro}</p>
    </div>
    <div className="tool-layout">
      <section className="tool-panel" aria-label={`${tool.title} workspace`}>
        <ToolWorkspace tool={tool} />
      </section>
      <aside className="tool-aside">
        <div className="aside-card howto-card"><span className="aside-icon"><Sparkles size={19} /></span><h2>How it works</h2><ol>{tool.howTo.map((step) => <li key={step}>{step}</li>)}</ol></div>
        <div className="aside-card privacy-card"><span className="aside-icon"><ShieldCheck size={19} /></span><h2>Private by design</h2><p>Files are handled in this browser. They are not sent to a PDF Toolkit server.</p><Link to="/privacy">Read the privacy details <ArrowRight size={14} /></Link></div>
      </aside>
    </div>
    <section className="content-section tool-faq">
      <span className="eyebrow">A little more detail</span><h2>Questions about {tool.shortTitle.toLowerCase()}?</h2>
      <div className="faq-grid">{tool.faqs.map((item) => <article className="faq-card" key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></article>)}</div>
    </section>
    <section className="related-section"><div><span className="eyebrow">Keep moving</span><h2>Related tools</h2></div><div className="related-links">{tool.related.map((slug) => { const related = toolBySlug(slug); return related ? <Link key={slug} to={toolHref(slug)}>{related.shortTitle}<ArrowRight size={15} /></Link> : null; })}</div></section>
  </main>;
}

function ToolWorkspace({ tool }: { tool: ToolSpec }) {
  const processor = useToolProcessor();
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [allPages, setAllPages] = useState(true);
  const [range, setRange] = useState('');
  const [rangeError, setRangeError] = useState('');
  const [rotation, setRotation] = useState(90);
  const [imagePageSize, setImagePageSize] = useState<'fit' | 'a4' | 'letter'>('fit');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [renderScale, setRenderScale] = useState(1.5);
  const [compressQuality, setCompressQuality] = useState(0.72);
  const [compressScale, setCompressScale] = useState(1);
  const [pagePosition, setPagePosition] = useState<'top' | 'bottom'>('bottom');
  const [pageAlign, setPageAlign] = useState<'left' | 'center' | 'right'>('center');
  const [startNumber, setStartNumber] = useState(1);
  const [watermark, setWatermark] = useState('CONFIDENTIAL');
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>('center');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.2);
  const [watermarkAngle, setWatermarkAngle] = useState(0);
  const [watermarkSize, setWatermarkSize] = useState(36);
  const [watermarkColor, setWatermarkColor] = useState('#3d616e');
  const [watermarkFont, setWatermarkFont] = useState<TextWatermarkOptions['font']>('Helvetica');
  const [watermarkBold, setWatermarkBold] = useState(true);
  const [watermarkTiled, setWatermarkTiled] = useState(false);
  const [watermarkOutline, setWatermarkOutline] = useState(false);
  const [watermarkMode, setWatermarkMode] = useState<'text' | 'image'>('text');
  const [watermarkImage, setWatermarkImage] = useState<File | null>(null);
  const [imageWatermarkSize, setImageWatermarkSize] = useState(180);
  const [freePro, setFreePro] = useState(() => isFreeProActivated());
  const [watermarkPreset, setWatermarkPreset] = useState('classic');
  const [infoValues, setInfoValues] = useState<[string, string][] | null>(null);
  const [infoBusy, setInfoBusy] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [copied, setCopied] = useState(false);
  const isInfoTool = tool.slug === 'pdf-page-counter' || tool.slug === 'pdf-metadata';
  const processorFile = processor.files[0];
  const watermarkImageUrl = useMemo(() => watermarkImage ? URL.createObjectURL(watermarkImage) : '', [watermarkImage]);
  useEffect(() => () => { if (watermarkImageUrl) URL.revokeObjectURL(watermarkImageUrl); }, [watermarkImageUrl]);

  function activateFreePro() {
    setFreePro(true);
    persistFreeProActivation();
  }

  function applyWatermarkPreset(id: string) {
    const preset = watermarkStyles.find((style) => style.id === id);
    if (!preset || !freePro) return;
    setWatermarkPreset(id); setWatermark(preset.text); setWatermarkSize(preset.size); setWatermarkOpacity(preset.opacity);
    setWatermarkAngle(preset.angle); setWatermarkPosition(preset.position); setWatermarkColor(preset.color);
    setWatermarkFont(preset.font); setWatermarkBold(preset.bold); setWatermarkTiled(!!preset.tiled); setWatermarkOutline(!!preset.outline);
    setWatermarkMode('text');
  }

  useEffect(() => {
    if (!isInfoTool || !processorFile) { setInfoValues(null); setInfoBusy(false); setInfoError(''); return; }
    const controller = new AbortController();
    setInfoBusy(true); setInfoError(''); setInfoValues(null);
    readMetadata(processorFile).then((values) => { if (!controller.signal.aborted) setInfoValues(values); }).catch((reason: unknown) => { if (!controller.signal.aborted) setInfoError(reason instanceof Error ? reason.message : 'This PDF could not be read.'); }).finally(() => { if (!controller.signal.aborted) setInfoBusy(false); });
    return () => controller.abort();
  }, [isInfoTool, processorFile]);

  useEffect(() => { if (tool.slug !== 'pdf-text-extractor') setExtractedText(''); }, [tool.slug, processorFile]);

  const updatePageCount = useCallback((count: number) => {
    setPageCount(count);
    setPageOrder((current) => current.length === count ? current : Array.from({ length: count }, (_, index) => index + 1));
    setRange((current) => current || (count > 0 ? `1-${count}` : ''));
  }, []);
  const resetAll = () => {
    processor.reset(); setSelectedPages([]); setPageCount(0); setPageOrder([]); setAllPages(true); setRange(''); setRangeError(''); setExtractedText(''); setCopied(false); setInfoValues(null); setInfoError(''); setUploadError('');
  };
  const acceptFiles = (files: File[]) => {
    processor.setFiles(files); setSelectedPages([]); setPageCount(0); setPageOrder([]); setAllPages(true); setRange(''); setRangeError(''); setExtractedText(''); setCopied(false); setUploadError('');
  };
  const selectFiles = (incoming: File[]) => {
    if (incoming.length === 0) { acceptFiles([]); return; }
    const combined = tool.multiple && processor.files.length ? [...processor.files, ...incoming] : incoming;
    try { validateFiles(combined, tool.accept); acceptFiles(combined); }
    catch (reason) { setUploadError(reason instanceof Error ? reason.message : 'Those files could not be added.'); }
  };
  const fileKind = tool.accept;
  const isImageConversion = tool.slug === 'jpg-to-pdf' || tool.slug === 'png-to-pdf';
  const isPageImages = tool.slug === 'pdf-to-jpg' || tool.slug === 'pdf-to-png';
  const usesPages = ['split-pdf', 'extract-pdf-pages', 'delete-pdf-pages', 'reorder-pdf-pages', 'rotate-pdf', 'pdf-to-jpg', 'pdf-to-png', 'compress-pdf'].includes(tool.slug);

  function togglePage(page: number) {
    const current = allPages && isPageImages ? Array.from({ length: pageCount }, (_, index) => index + 1) : selectedPages;
    const next = new Set(current);
    if (next.has(page)) next.delete(page); else next.add(page);
    const values = [...next].sort((a, b) => a - b);
    setSelectedPages(values); setAllPages(values.length === pageCount && pageCount > 0);
  }
  function setPageSelection(pages: number[]) {
    setSelectedPages(pages); setAllPages(pages.length === pageCount && pageCount > 0);
  }
  const previewSelection = isPageImages && allPages ? Array.from({ length: pageCount }, (_, index) => index + 1) : selectedPages;
  const previewX = watermarkPosition.includes('left') ? '12%' : watermarkPosition.includes('right') ? '88%' : '50%';
  const previewY = watermarkPosition === 'header' || watermarkPosition.startsWith('top-') ? '14%'
    : watermarkPosition === 'footer' || watermarkPosition.startsWith('bottom-') ? '86%' : '50%';
  const watermarkPreviewPlacement = { position: 'absolute' as const, left: previewX, top: previewY, transform: `translate(-50%, -50%) rotate(${watermarkAngle}deg)` };

  const canRun = useMemo(() => {
    if (!processor.files.length || processor.busy) return false;
    if (tool.slug === 'merge-pdf') return processor.files.length >= 2;
    if (tool.slug === 'extract-pdf-pages') return selectedPages.length > 0;
    if (tool.slug === 'delete-pdf-pages') return selectedPages.length > 0 && selectedPages.length < pageCount;
    if (tool.slug === 'split-pdf') return pageCount > 0 && !!range.trim();
    if (tool.slug === 'reorder-pdf-pages') return pageCount > 0 && pageCount <= MAX_RENDER_PAGES;
    if (tool.slug === 'pdf-to-jpg' || tool.slug === 'pdf-to-png') return pageCount > 0 && (allPages ? pageCount <= MAX_CONVERSION_PAGES : selectedPages.length > 0 && selectedPages.length <= MAX_CONVERSION_PAGES);
    if (tool.slug === 'rotate-pdf') return pageCount > 0;
    if (tool.slug === 'compress-pdf') return pageCount > 0 && pageCount <= MAX_COMPRESSION_PAGES;
    if (tool.slug === 'pdf-text-extractor') return true;
    if (tool.slug === 'add-watermark') return watermarkMode === 'image' ? !!watermarkImage : watermark.trim().length > 0;
    return true;
  }, [processor.files.length, processor.busy, tool.slug, selectedPages.length, pageCount, range, allPages, watermark, watermarkMode, watermarkImage]);

  async function process() {
    if (!processor.files.length) return;
    if (tool.slug === 'split-pdf' && processorFile) {
      try { parsePageRanges(range, pageCount); setRangeError(''); } catch (reason) { setRangeError(reason instanceof Error ? reason.message : 'Check the page range.'); return; }
    }
    if (tool.slug === 'delete-pdf-pages' && selectedPages.length >= pageCount) { setRangeError('At least one page must remain in the new PDF.'); return; }
    setRangeError('');
    await processor.run(async (signal): Promise<ToolOutput> => {
      const file = processor.files[0];
      if (tool.slug === 'pdf-to-word') {
        const { pdfToWord } = await import('../lib/convert-word');
        const result = await pdfToWord(file, signal, (done, total) => processor.setProgress(`Converting page ${done} of ${total} to editable text…`));
        return { title: 'Word document is ready', details: 'Text and basic paragraph emphasis were converted. Review the layout in Word.', files: [result] };
      }
      if (tool.slug === 'pdf-to-excel') {
        const { pdfToExcel } = await import('../lib/convert-excel');
        const result = await pdfToExcel(file, signal, (done, total) => processor.setProgress(`Reading table-like text on page ${done} of ${total}…`));
        return { title: 'Excel workbook is ready', details: 'Each PDF page is a worksheet. Column placement is estimated from text spacing; review complex tables.', files: [result] };
      }
      if (tool.slug === 'pdf-to-powerpoint') {
        const { pdfToPowerPoint } = await import('../lib/convert-powerpoint');
        const result = await pdfToPowerPoint(file, signal, (done, total) => processor.setProgress(`Rendering slide ${done} of ${total}…`));
        return { title: 'PowerPoint is ready', details: 'One image-based slide was created for each PDF page.', files: [result] };
      }
      if (tool.slug === 'merge-pdf') {
        const blob = await mergePdfs(processor.files, signal);
        return { title: 'Your PDFs are merged', details: `${processor.files.length} files combined into one document.`, files: [{ name: 'merged.pdf', blob }] };
      }
      if (tool.slug === 'split-pdf' || tool.slug === 'extract-pdf-pages') {
        const pages = tool.slug === 'split-pdf' ? parsePageRanges(range, pageCount) : selectedPages;
        const blob = await makePdfFromPages(file, pages, signal);
        return { title: `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} saved`, details: `Pages ${pages.length <= 12 ? pages.join(', ') : `${pages.length} selected pages`} are in the new PDF.`, files: [{ name: `${safeBaseName(file.name)}-pages.pdf`, blob }] };
      }
      if (tool.slug === 'delete-pdf-pages') {
        const blob = await makePdfWithoutPages(file, selectedPages, signal);
        return { title: 'Selected pages removed', details: `${pageCount - selectedPages.length} pages remain.`, files: [{ name: `${safeBaseName(file.name)}-edited.pdf`, blob }] };
      }
      if (tool.slug === 'reorder-pdf-pages') {
        const blob = await makePdfFromPages(file, pageOrder, signal);
        return { title: 'Page order updated', details: `${pageOrder.length} pages arranged in the order shown.`, files: [{ name: `${safeBaseName(file.name)}-reordered.pdf`, blob }] };
      }
      if (tool.slug === 'rotate-pdf') {
        const selected = selectedPages.length ? selectedPages : null;
        const blob = await rotatePdf(file, selected, rotation, signal);
        return { title: 'PDF pages rotated', details: `${selected ? `${selected.length} selected ${selected.length === 1 ? 'page' : 'pages'}` : 'All pages'} rotated ${rotation}°.`, files: [{ name: `${safeBaseName(file.name)}-rotated.pdf`, blob }] };
      }
      if (isImageConversion) {
        const blob = await imagesToPdf(processor.files, imagePageSize, orientation, signal);
        return { title: 'Your images are in a PDF', details: `${processor.files.length} ${processor.files.length === 1 ? 'image' : 'images'} added in the order shown.`, files: [{ name: `${tool.slug === 'jpg-to-pdf' ? 'jpg' : 'png'}-images.pdf`, blob }] };
      }
      if (isPageImages) {
        const pages = allPages ? Array.from({ length: pageCount }, (_, index) => index + 1) : selectedPages;
        const format = tool.slug === 'pdf-to-jpg' ? 'jpeg' : 'png';
        const images = await renderPagesToImages(file, pages, format, renderScale, 0.9, signal, (done, total) => processor.setProgress(`Rendering page ${done} of ${total}…`));
        const zip = await makeZip(images);
        return { title: 'Page images are ready', details: `${images.length} images bundled in a ZIP file.`, files: [{ name: `${safeBaseName(file.name)}-${format}.zip`, blob: zip }], previewImages: images };
      }
      if (tool.slug === 'compress-pdf') {
        const originalSize = file.size;
        const blob = await compressPdfAsImages(file, compressQuality, compressScale, signal, (done, total) => processor.setProgress(`Rebuilding page ${done} of ${total}…`));
        const delta = Math.round(Math.abs(originalSize - blob.size) / originalSize * 100);
        const detail = blob.size < originalSize
          ? `Original ${formatBytes(originalSize)} · New ${formatBytes(blob.size)} · ${delta}% smaller. Text and vector content are now page images.`
          : `Original ${formatBytes(originalSize)} · New ${formatBytes(blob.size)} · ${delta}% larger. This setting did not reduce the file; text and vector content are now page images.`;
        return { title: 'Compression result measured', details: detail, files: [{ name: `${safeBaseName(file.name)}-compressed.pdf`, blob }] };
      }
      if (tool.slug === 'pdf-text-extractor') {
        const text = await extractText(file, signal, (done, total) => processor.setProgress(`Reading page ${done} of ${total}…`));
        setExtractedText(text);
        setCopied(false);
        const detail = text.trim() ? `${text.length.toLocaleString()} characters found. Scanned pages without a text layer are not recognized.` : 'No selectable text was found. This file may contain scanned images; this tool does not perform OCR.';
        return { title: 'Text extraction finished', details: detail, files: [{ name: `${safeBaseName(file.name)}.txt`, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) }] };
      }
      if (tool.slug === 'add-page-numbers') {
        const blob = await addPageNumbers(file, startNumber, pagePosition, pageAlign, signal);
        return { title: 'Page numbers added', details: `Starting at ${startNumber}, aligned ${pageAlign} at the ${pagePosition} of each page.`, files: [{ name: `${safeBaseName(file.name)}-numbered.pdf`, blob }] };
      }
      if (tool.slug === 'add-watermark') {
        const blob = watermarkMode === 'image' && watermarkImage
          ? await addImageWatermark(file, watermarkImage, { opacity: watermarkOpacity, size: imageWatermarkSize, angle: watermarkAngle, position: watermarkPosition, tiled: freePro && watermarkTiled }, signal)
          : await addWatermark(file, watermark.trim(), watermarkSize, watermarkOpacity, watermarkAngle, watermarkPosition, signal, { color: freePro ? watermarkColor : '#3d616e', font: freePro ? watermarkFont : 'Helvetica', bold: freePro ? watermarkBold : true, tiled: freePro && watermarkTiled, outline: freePro && watermarkOutline });
        const label = watermarkMode === 'image' ? 'Image watermark' : `“${watermark.trim()}”`;
        return { title: 'Watermark added', details: `${label} applied to ${pageCount === 1 ? 'the page' : 'each page'}.`, files: [{ name: `${safeBaseName(file.name)}-watermarked.pdf`, blob }] };
      }
      throw new Error('This tool is not available.');
    });
  }

  if (isInfoTool) return <div className="workspace-content">
    <FileDropZone onSelect={selectFiles} disabled={infoBusy} />
    {processor.files.length > 0 && <>
      <FileListEditor files={processor.files} onChange={acceptFiles} disabled={infoBusy} />
      {uploadError && <StatusMessage error={uploadError} />}
      <StatusMessage error={infoError} busy={infoBusy} progress="Reading document details…" />
      {infoValues && <section className="metadata-card" aria-live="polite">{tool.slug === 'pdf-page-counter' && <div className="page-count-highlight"><span>Pages in this document</span><strong>{infoValues.find(([key]) => key === 'Pages')?.[1] ?? '—'}</strong></div>}<dl className="metadata-grid">{infoValues.filter(([key]) => tool.slug === 'pdf-page-counter' ? key !== 'Pages' : true).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>}
      <div className="workspace-bottom"><PrivacyNote /><ResetButton onClick={resetAll} /></div>
    </>}
    <div className="info-tip"><Info size={16} /><span>Some PDFs do not include optional metadata. Only information present in the file is shown.</span></div>
  </div>;

  return <div className="workspace-content">
    <FileDropZone kind={fileKind} multiple={tool.multiple} onSelect={selectFiles} disabled={processor.busy} />
    <FileListEditor files={processor.files} onChange={acceptFiles} disabled={processor.busy} previews={isImageConversion} />
    {uploadError && <StatusMessage error={uploadError} />}
    {tool.slug === 'add-watermark' && !processorFile && <section className={`free-pro-card${freePro ? ' is-active' : ''}`} aria-live="polite"><div><span className="eyebrow">{freePro ? '✓ Pro activated' : 'Pro features'}</span><strong>{freePro ? 'Advanced watermark tools unlocked' : 'Unlock advanced watermark tools — FREE'}</strong><p>Pro is free. Supported by advertising; no payment or card is required.</p></div>{!freePro && <button type="button" className="button button-primary" onClick={activateFreePro}><Unlock size={15} />Activate Free Pro</button>}</section>}

    {tool.slug === 'merge-pdf' && processor.files.length > 0 && processor.files.length < 2 && <p className="notice notice-muted">Add at least one more PDF to merge them.</p>}

    {usesPages && processorFile && tool.slug !== 'pdf-page-counter' && tool.slug !== 'pdf-metadata' && <PDFPageSelector
      key={`${tool.slug}-${processorFile.name}-${processorFile.lastModified}`}
      file={processorFile}
      selected={previewSelection}
      onToggle={['extract-pdf-pages', 'delete-pdf-pages', 'rotate-pdf', 'pdf-to-jpg', 'pdf-to-png'].includes(tool.slug) ? togglePage : undefined}
      onSelectionChange={['extract-pdf-pages', 'delete-pdf-pages', 'rotate-pdf', 'pdf-to-jpg', 'pdf-to-png'].includes(tool.slug) ? setPageSelection : undefined}
      order={tool.slug === 'reorder-pdf-pages' ? pageOrder : undefined}
      onOrderChange={tool.slug === 'reorder-pdf-pages' ? setPageOrder : undefined}
      onCount={updatePageCount}
      disabled={processor.busy}
    />}

    {processorFile && tool.slug === 'reorder-pdf-pages' && pageCount > MAX_RENDER_PAGES && <p className="notice notice-muted">Reordering with page previews is limited to {MAX_RENDER_PAGES} pages. Split this document into smaller files first.</p>}
    {processorFile && tool.slug === 'compress-pdf' && pageCount > MAX_COMPRESSION_PAGES && <p className="notice notice-muted">The browser-based compressor supports up to {MAX_COMPRESSION_PAGES} pages to limit memory use.</p>}
    {processorFile && isPageImages && !allPages && selectedPages.length > MAX_CONVERSION_PAGES && <p className="notice notice-muted">Choose {MAX_CONVERSION_PAGES} pages or fewer for this browser conversion.</p>}
    {processorFile && isPageImages && allPages && pageCount > MAX_CONVERSION_PAGES && <p className="notice notice-muted">Convert up to {MAX_CONVERSION_PAGES} pages at a time. Select a smaller set of pages above.</p>}

    {processorFile && <div className="tool-options">
      {tool.slug === 'split-pdf' && <>
        <Field label="Pages to keep" hint={pageCount ? `Enter pages from 1 to ${pageCount}.` : 'Use numbers, ranges, or both.'}><input className="text-input" value={range} onChange={(event) => { setRange(event.target.value); setRangeError(''); }} placeholder="For example: 1-3, 7-9" />{rangeError && <span className="field-error" role="alert">{rangeError}</span>}</Field>
      </>}
      {tool.slug === 'extract-pdf-pages' && <p className="selection-summary">Choose page thumbnails above. {selectedPages.length ? `${selectedPages.length} ${selectedPages.length === 1 ? 'page' : 'pages'} selected.` : 'Select at least one page to continue.'}</p>}
      {tool.slug === 'delete-pdf-pages' && <><p className="selection-summary">Choose pages to remove. {selectedPages.length ? `${pageCount - selectedPages.length} ${pageCount - selectedPages.length === 1 ? 'page remains' : 'pages remain'}.` : 'At least one page must be removed.'}</p>{pageCount > 0 && selectedPages.length >= pageCount && <span role="alert" className="field-error">At least one page must remain in the new PDF.</span>}</>}
      {tool.slug === 'rotate-pdf' && <div className="option-grid"><Field label="Rotation"><select className="text-input" value={rotation} onChange={(event) => setRotation(Number(event.target.value))}><option value={90}>90° clockwise</option><option value={180}>180°</option><option value={270}>270° clockwise</option></select></Field><p className="selection-summary">{selectedPages.length ? `${selectedPages.length} selected pages will rotate.` : 'No pages selected: all pages will rotate.'}</p></div>}
      {isImageConversion && <div className="option-grid"><Field label="PDF page size"><select className="text-input" value={imagePageSize} onChange={(event) => setImagePageSize(event.target.value as typeof imagePageSize)}><option value="fit">Fit to each image</option><option value="a4">A4</option><option value="letter">US Letter</option></select></Field><Field label="Orientation"><select className="text-input" disabled={imagePageSize === 'fit'} value={orientation} onChange={(event) => setOrientation(event.target.value as typeof orientation)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></Field></div>}
      {isPageImages && <>
        <p className="selection-summary">{allPages ? 'All pages will be converted.' : selectedPages.length ? `${selectedPages.length} pages selected.` : 'Select pages above or use Select all.'}</p>
        <Field label="Image size"><select className="text-input" value={renderScale} onChange={(event) => setRenderScale(Number(event.target.value))}><option value={1}>Standard</option><option value={1.5}>High quality</option><option value={2}>Very high quality</option></select></Field>
      </>}
      {tool.slug === 'compress-pdf' && <div className="compression-callout"><Info size={18} /><div><strong>Content becomes images</strong><p>To reduce size, each page is rendered as a JPEG image. Text, links, forms, and vector graphics will no longer be editable or searchable. The final size change is measured after processing.</p></div><div className="option-grid"><Field label="Image quality"><select className="text-input" value={compressQuality} onChange={(event) => setCompressQuality(Number(event.target.value))}><option value={0.55}>Smaller file · lower quality</option><option value={0.72}>Balanced</option><option value={0.88}>Sharper · larger file</option></select></Field><Field label="Page resolution"><select className="text-input" value={compressScale} onChange={(event) => setCompressScale(Number(event.target.value))}><option value={0.75}>Lower resolution</option><option value={1}>Standard</option><option value={1.25}>Higher resolution</option></select></Field></div></div>}
      {tool.slug === 'add-page-numbers' && <div className="option-grid"><Field label="First number"><input className="text-input" type="number" min={0} max={99999} value={startNumber} onChange={(event) => setStartNumber(Math.max(0, Math.min(99999, Number(event.target.value) || 0)))} /></Field><Field label="Position"><select className="text-input" value={pagePosition} onChange={(event) => setPagePosition(event.target.value as typeof pagePosition)}><option value="bottom">Bottom</option><option value="top">Top</option></select></Field><Field label="Alignment"><select className="text-input" value={pageAlign} onChange={(event) => setPageAlign(event.target.value as typeof pageAlign)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></Field></div>}
      {tool.slug === 'add-watermark' && <div className="watermark-fields">
        <section className={`free-pro-card${freePro ? ' is-active' : ''}`} aria-live="polite">
          <div><span className="eyebrow">{freePro ? '✓ Pro activated' : 'Pro features'}</span><strong>{freePro ? 'Advanced watermark tools unlocked' : 'Unlock advanced watermark tools — FREE'}</strong><p>Pro is free. Advanced tools are supported by advertising; no payment or card is required.</p></div>
          {!freePro && <button type="button" className="button button-primary" onClick={activateFreePro}><Unlock size={15} />Activate Free Pro</button>}
        </section>
        <div className="free-ad-slot" aria-label="Advertisement placement reserved">Free access supported by ads <span>Ad placement reserved</span></div>
        <div className="option-grid">
          <Field label="Watermark text"><input className="text-input" maxLength={80} value={watermark} onChange={(event) => setWatermark(event.target.value)} placeholder="Enter a short label" /></Field>
          <Field label="Position"><select className="text-input" value={watermarkPosition} onChange={(event) => setWatermarkPosition(event.target.value as WatermarkPosition)}><option value="center">Center</option><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option><option value="center-left">Center left</option><option value="center-right">Center right</option><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="header">Header</option><option value="footer">Footer</option></select></Field>
          <Field label="Text size"><input className="text-input" type="number" min={10} max={100} value={watermarkSize} onChange={(event) => setWatermarkSize(Math.max(10, Math.min(100, Number(event.target.value) || 10)))} /></Field>
          <Field label={`Opacity · ${Math.round(watermarkOpacity * 100)}%`}><input type="range" min={0.08} max={0.9} step={0.02} value={watermarkOpacity} onChange={(event) => setWatermarkOpacity(Number(event.target.value))} /></Field>
          <Field label={`Rotation · ${watermarkAngle}°`}><input type="range" min={-60} max={60} step={5} value={watermarkAngle} onChange={(event) => setWatermarkAngle(Number(event.target.value))} /></Field>
        </div>
        <fieldset className="pro-watermark-settings" disabled={!freePro}>
          <legend><Sparkles size={15} />Pro watermark styles</legend>
          {!freePro && <p className="selection-summary">Activate Free Pro to choose styles, colors, tile patterns, and image watermarks.</p>}
          <div className="watermark-style-grid">{watermarkStyles.map((style) => <button key={style.id} type="button" className={`watermark-style-card${watermarkPreset === style.id ? ' is-selected' : ''}`} onClick={() => applyWatermarkPreset(style.id)} aria-pressed={watermarkPreset === style.id}>
            <span style={{ color: style.color, opacity: Math.min(.85, Math.max(.45, style.opacity + .3)), fontFamily: style.font === 'TimesRoman' ? 'Georgia,serif' : style.font === 'Courier' ? 'monospace' : 'Arial,sans-serif', fontWeight: style.bold ? 800 : 400, transform: `rotate(${style.angle}deg)`, fontSize: `${Math.min(18, Math.max(9, style.size / 3))}px`, letterSpacing: style.id === 'stamp' ? '.12em' : undefined }}>{style.text}</span>
            <small>{style.label}</small>
          </button>)}</div>
          <div className="watermark-mode-tabs" role="group" aria-label="Watermark type"><button type="button" className={watermarkMode === 'text' ? 'is-selected' : ''} onClick={() => setWatermarkMode('text')}>Text watermark</button><button type="button" className={watermarkMode === 'image' ? 'is-selected' : ''} onClick={() => setWatermarkMode('image')}><ImageIcon size={14} />Image watermark</button></div>
          {watermarkMode === 'text' ? <div className="option-grid">
            <Field label="Font"><select className="text-input" value={watermarkFont} onChange={(event) => setWatermarkFont(event.target.value as TextWatermarkOptions['font'])}><option value="Helvetica">Modern sans</option><option value="TimesRoman">Elegant serif</option><option value="Courier">Typewriter</option></select></Field>
            <Field label="Custom text color"><input className="text-input color-input" type="color" value={watermarkColor} onChange={(event) => setWatermarkColor(event.target.value)} /></Field>
            <label className="check-field"><input type="checkbox" checked={watermarkBold} onChange={(event) => setWatermarkBold(event.target.checked)} />Bold appearance</label>
            <label className="check-field"><input type="checkbox" checked={watermarkTiled} onChange={(event) => setWatermarkTiled(event.target.checked)} />Repeat across every page</label>
            <label className="check-field"><input type="checkbox" checked={watermarkOutline} onChange={(event) => setWatermarkOutline(event.target.checked)} />Stamp / outlined appearance</label>
          </div> : <div className="option-grid">
            <Field label="Watermark image (PNG, JPG, WEBP)"><input className="text-input image-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setWatermarkImage(event.target.files?.[0] ?? null)} /></Field>
            <Field label={`Image width · ${imageWatermarkSize} pt`}><input type="range" min="50" max="500" step="10" value={imageWatermarkSize} onChange={(event) => setImageWatermarkSize(Number(event.target.value))} /></Field>
            <label className="check-field"><input type="checkbox" checked={watermarkTiled} onChange={(event) => setWatermarkTiled(event.target.checked)} />Tile image across every page</label>
          </div>}
        </fieldset>
        <div className="watermark-preview" aria-live="polite">
          {watermarkTiled && freePro ? <div className="watermark-preview-tiled" aria-label={watermarkMode === 'image' ? 'Repeated image watermark preview' : 'Repeated text watermark preview'}>{Array.from({ length: 9 }, (_, index) => watermarkMode === 'image' && watermarkImageUrl ? <img key={index} src={watermarkImageUrl} alt="" style={{ opacity: watermarkOpacity, transform: `rotate(${watermarkAngle}deg)`, width: `${Math.min(72, Math.max(24, imageWatermarkSize * 0.18))}px` }} /> : <span key={index} style={{ opacity: watermarkOpacity, transform: `rotate(${watermarkAngle}deg)`, fontSize: `${Math.min(17, Math.max(8, watermarkSize * 0.3))}px`, color: watermarkColor, fontWeight: watermarkBold ? 800 : 400 }}>{watermark.trim() || 'WATERMARK'}</span>)}</div>
            : <span style={{ ...watermarkPreviewPlacement, opacity: watermarkOpacity, fontSize: `${watermarkMode === 'image' ? Math.min(30, Math.max(14, imageWatermarkSize * 0.2)) : Math.min(30, Math.max(14, watermarkSize * 0.55))}px`, color: freePro ? watermarkColor : '#3d616e', fontFamily: watermarkFont === 'TimesRoman' ? 'Georgia,serif' : watermarkFont === 'Courier' ? 'monospace' : 'Manrope,sans-serif', fontWeight: watermarkBold ? 800 : 400 }}>{watermarkMode === 'image' && watermarkImageUrl && freePro ? <img src={watermarkImageUrl} alt="Watermark image preview" /> : watermark.trim() || 'Your watermark'}</span>}
          <small>Live page preview · {watermarkPosition.replaceAll('-', ' ')}</small>
        </div>
      </div>}
    </div>}

    {tool.slug === 'pdf-text-extractor' && extractedText && <section className="extracted-text-card"><div className="section-mini-heading"><div><h3>Extracted text</h3><span>{extractedText.length.toLocaleString()} characters</span></div><button type="button" className="button button-secondary button-small" onClick={async () => { try { await navigator.clipboard.writeText(extractedText); setCopied(true); } catch { setCopied(false); } }}><Clipboard size={15} />{copied ? 'Copied' : 'Copy text'}</button></div><textarea readOnly value={extractedText} aria-label="Extracted PDF text" rows={10} /></section>}

    {processor.error && <StatusMessage error={processor.error} />}
    {processor.output && <OutputCard output={processor.output} />}
    {processor.files.length > 0 && !processor.output && <StatusMessage busy={processor.busy} progress={processor.progress} />}

    {processor.files.length > 0 && <div className="workspace-bottom">
      <PrivacyNote />
      <div className="workspace-buttons">
        <ResetButton onClick={resetAll} disabled={!processor.files.length && !processor.busy} />
        <button type="button" className="button button-primary process-button" onClick={process} disabled={!canRun}>
          {processor.busy ? <><LoaderCircle size={16} className="spin" />Processing…</> : <>{tool.slug === 'merge-pdf' ? 'Merge PDFs' : tool.slug === 'split-pdf' || tool.slug === 'extract-pdf-pages' ? 'Extract pages' : tool.slug === 'delete-pdf-pages' ? 'Remove selected pages' : tool.slug === 'reorder-pdf-pages' ? 'Save new order' : tool.slug === 'rotate-pdf' ? 'Rotate PDF' : isImageConversion ? 'Create PDF' : isPageImages ? 'Convert pages' : tool.slug === 'compress-pdf' ? 'Compress PDF' : tool.slug === 'pdf-text-extractor' ? 'Extract text' : tool.slug === 'add-page-numbers' ? 'Add page numbers' : 'Add watermark'}<ArrowRight size={16} /></>}
        </button>
      </div>
    </div>}
    {!processor.files.length && <div className="quiet-assurance"><Check size={15} /><span>Free to use · No account · No file upload</span></div>}
  </div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

function NotFound() {
  useSeo('Page not found | PDF Toolkit', 'The page you requested could not be found.', '/404');
  return <main className="page-shell not-found"><span className="eyebrow">Not found</span><h1>This page has wandered off.</h1><p>Try another PDF tool or head back to the homepage.</p><Link className="button button-primary" to="/">Browse PDF tools<ArrowRight size={16} /></Link></main>;
}
