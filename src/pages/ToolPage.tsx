import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clipboard, Info, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toolBySlug, toolHref } from '../data/tools';
import type { ToolSpec } from '../data/tools';
import {
  addPageNumbers, addWatermark, compressPdfAsImages, extractText, formatBytes, imagesToPdf,
  makePdfFromPages, makePdfWithoutPages, makeZip, mergePdfs, parsePageRanges,
  readMetadata, renderPagesToImages, rotatePdf, safeBaseName,
  MAX_COMPRESSION_PAGES, MAX_CONVERSION_PAGES, MAX_RENDER_PAGES, validateFiles,
} from '../lib/pdf';
import {
  FileDropZone, FileListEditor, OutputCard, PDFPageSelector, PrivacyNote, ResetButton,
  StatusMessage, useToolProcessor,
} from '../components/ToolParts';
import type { ToolOutput } from '../components/ToolParts';
import type { ReactNode } from 'react';
import { useSeo } from '../useSeo';

function slugForTitle(title: string) { return `${title} | PDF Toolkit`; }

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
  const [watermarkPosition, setWatermarkPosition] = useState<'center' | 'top-left' | 'bottom-right'>('center');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.2);
  const [watermarkAngle, setWatermarkAngle] = useState(0);
  const [watermarkSize, setWatermarkSize] = useState(36);
  const [infoValues, setInfoValues] = useState<[string, string][] | null>(null);
  const [infoBusy, setInfoBusy] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [copied, setCopied] = useState(false);
  const isInfoTool = tool.slug === 'pdf-page-counter' || tool.slug === 'pdf-metadata';
  const processorFile = processor.files[0];

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
    if (tool.slug === 'add-watermark') return watermark.trim().length > 0;
    return true;
  }, [processor.files.length, processor.busy, tool.slug, selectedPages.length, pageCount, range, allPages, watermark]);

  async function process() {
    if (!processor.files.length) return;
    if (tool.slug === 'split-pdf' && processorFile) {
      try { parsePageRanges(range, pageCount); setRangeError(''); } catch (reason) { setRangeError(reason instanceof Error ? reason.message : 'Check the page range.'); return; }
    }
    if (tool.slug === 'delete-pdf-pages' && selectedPages.length >= pageCount) { setRangeError('At least one page must remain in the new PDF.'); return; }
    setRangeError('');
    await processor.run(async (signal): Promise<ToolOutput> => {
      const file = processor.files[0];
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
        const blob = await addWatermark(file, watermark.trim(), watermarkSize, watermarkOpacity, watermarkAngle, watermarkPosition, signal);
        return { title: 'Watermark added', details: `“${watermark.trim()}” applied to ${pageCount === 1 ? 'the page' : 'each page'}.`, files: [{ name: `${safeBaseName(file.name)}-watermarked.pdf`, blob }] };
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
      {tool.slug === 'add-watermark' && <div className="watermark-fields"><Field label="Watermark text"><input className="text-input" maxLength={80} value={watermark} onChange={(event) => setWatermark(event.target.value)} placeholder="Enter a short label" /></Field><div className="option-grid"><Field label="Position"><select className="text-input" value={watermarkPosition} onChange={(event) => setWatermarkPosition(event.target.value as typeof watermarkPosition)}><option value="center">Center</option><option value="top-left">Top left</option><option value="bottom-right">Bottom right</option></select></Field><Field label="Text size"><input className="text-input" type="number" min={10} max={100} value={watermarkSize} onChange={(event) => setWatermarkSize(Math.max(10, Math.min(100, Number(event.target.value) || 10)))} /></Field><Field label={`Opacity · ${Math.round(watermarkOpacity * 100)}%`}><input type="range" min={0.08} max={0.7} step={0.02} value={watermarkOpacity} onChange={(event) => setWatermarkOpacity(Number(event.target.value))} /></Field><Field label={`Rotation · ${watermarkAngle}°`}><input type="range" min={-60} max={60} step={5} value={watermarkAngle} onChange={(event) => setWatermarkAngle(Number(event.target.value))} /></Field></div><div className="watermark-preview" aria-live="polite"><span style={{ opacity: watermarkOpacity, transform: `rotate(${watermarkAngle}deg)`, fontSize: `${Math.min(30, Math.max(14, watermarkSize * 0.55))}px` }}>{watermark.trim() || 'Your watermark'}</span><small>Preview</small></div></div>}
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
