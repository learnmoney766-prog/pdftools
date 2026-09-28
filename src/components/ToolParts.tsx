import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, FileImage, FileText, LoaderCircle, LockKeyhole, RotateCcw, X } from 'lucide-react';
import { explainPdfError, formatBytes, getPagePreviews, MAX_RENDER_PAGES, validateFiles } from '../lib/pdf';

export interface DownloadItem { name: string; blob: Blob }
export interface ToolOutput { title: string; details?: string; files: DownloadItem[]; previewImages?: DownloadItem[] }

export function FileDropZone({ kind = 'pdf', multiple = false, onSelect, disabled = false, label }: {
  kind?: 'pdf' | 'jpg' | 'png'; multiple?: boolean; onSelect: (files: File[]) => void; disabled?: boolean; label?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const accept = kind === 'pdf' ? '.pdf,application/pdf' : kind === 'jpg' ? '.jpg,.jpeg,image/jpeg' : '.png,image/png';
  const fileType = kind === 'pdf' ? 'PDF' : kind === 'jpg' ? 'JPG or JPEG' : 'PNG';

  function choose(files: FileList | File[]) {
    const selected = Array.from(files);
    try {
      validateFiles(selected, kind);
      setError('');
      onSelect(selected);
    } catch (reason) {
      setError(explainPdfError(reason));
      onSelect([]);
    }
    if (input.current) input.current.value = '';
  }

  return <div>
    <input ref={input} id={id} className="visually-hidden" type="file" accept={accept} multiple={multiple} disabled={disabled} aria-hidden="true" tabIndex={-1} onChange={(event) => event.currentTarget.files && choose(event.currentTarget.files)} />
    <button
      className={`drop-zone${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
      type="button"
      aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
      disabled={disabled}
      onClick={() => input.current?.click()}
      onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); if (!disabled) choose(event.dataTransfer.files); }}
    >
      <span className="drop-icon"><FileText size={24} strokeWidth={1.8} /></span>
      <span className="drop-heading">{label ?? (multiple ? `Choose ${fileType} files` : `Choose a ${fileType} file`)}</span>
      <span className="drop-subheading">or drop {multiple ? 'files' : 'a file'} here</span>
      <span className="drop-hint">{kind === 'pdf' ? 'PDF files · up to 100 MB each' : `${fileType} images · up to 25 MB each, 100 MB total`}</span>
    </button>
    <span id={`${id}-help`} className="visually-hidden">Use the file picker or drag and drop supported files. {kind === 'pdf' ? 'Maximum PDF size 100 megabytes.' : 'Maximum image size 25 megabytes each and 100 megabytes total.'}</span>
    {error && <p id={`${id}-error`} role="alert" className="inline-error">{error}</p>}
  </div>;
}

export function FileListEditor({ files, onChange, disabled = false, previews = false }: {
  files: File[]; onChange: (files: File[]) => void; disabled?: boolean; previews?: boolean;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = previews ? files.map((file) => URL.createObjectURL(file)) : [];
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files, previews]);
  if (!files.length) return null;
  return <ul className={`file-list${previews ? ' image-file-list' : ''}`} aria-label="Selected files">
    {files.map((file, index) => <li className="file-row" key={`${file.name}-${file.lastModified}-${index}`}>
      {previews ? <img className="file-thumb" src={urls[index]} alt="" /> : <span className="file-badge"><FileText size={16} /></span>}
      <span className="file-meta"><span className="file-name" title={file.name}>{file.name}</span><span className="file-size">{formatBytes(file.size)}</span></span>
      <div className="file-actions">
        {index > 0 && <button className="icon-button" type="button" aria-label={`Move ${file.name} up`} title="Move up" disabled={disabled} onClick={() => { const next = [...files]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}><ArrowUp size={17} /></button>}
        {index < files.length - 1 && <button className="icon-button" type="button" aria-label={`Move ${file.name} down`} title="Move down" disabled={disabled} onClick={() => { const next = [...files]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; onChange(next); }}><ArrowDown size={17} /></button>}
        <button className="icon-button remove-button" type="button" aria-label={`Remove ${file.name}`} title="Remove file" disabled={disabled} onClick={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))}><X size={17} /></button>
      </div>
    </li>)}</ul>;
}

export function PDFPageSelector({ file, selected, onToggle, onSelectionChange, order, onOrderChange, onCount, disabled = false }: {
  file?: File; selected: number[]; onToggle?: (page: number) => void; onSelectionChange?: (pages: number[]) => void; order?: number[]; onOrderChange?: (order: number[]) => void; onCount: (count: number) => void; disabled?: boolean;
}) {
  const [previews, setPreviews] = useState<{ page: number; url: string }[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [range, setRange] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) { setPreviews([]); setCount(0); setError(''); return; }
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setLoading(true); setError(''); setPreviews([]); setCount(0);
    getPagePreviews(file, controller.signal, () => undefined).then((data) => {
      if (controller.signal.aborted) return;
      setCount(data.count); onCount(data.count); setPreviews(data.previews);
      if (!data.previews.length && data.count > MAX_RENDER_PAGES) setError(`This PDF has ${data.count} pages. Previews are limited to ${MAX_RENDER_PAGES} pages, so use the page range field below.`);
    }).catch((reason) => { if (!controller.signal.aborted) setError(explainPdfError(reason)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [file, onCount]);

  useEffect(() => () => abort.current?.abort(), []);

  const ordered = order ?? Array.from({ length: count }, (_, index) => index + 1);
  function move(fromPage: number, toPage: number) {
    if (!onOrderChange) return;
    const next = [...ordered];
    const from = next.indexOf(fromPage); const to = next.indexOf(toPage);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    onOrderChange(next);
  }
  function toggleAll() {
    if (!onToggle || !count) return;
    const every = selected.length === count;
    if (onSelectionChange) { onSelectionChange(every ? [] : Array.from({ length: count }, (_, index) => index + 1)); return; }
    for (let page = 1; page <= count; page += 1) if (every ? selected.includes(page) : !selected.includes(page)) onToggle(page);
  }

  if (!file) return null;
  return <section className="page-selector" aria-label="PDF pages">
    <div className="section-mini-heading"><div><h3>Pages in this PDF</h3>{count > 0 && <span>{count} {count === 1 ? 'page' : 'pages'}</span>}</div>
      {onToggle && count > 0 && <div className="selection-tools"><button type="button" className="text-button" disabled={disabled} onClick={toggleAll}>{selected.length === count ? 'Clear selection' : 'Select all'}</button><span>{selected.length} selected</span></div>}
    </div>
    {loading && <div className="preview-loading"><LoaderCircle size={18} className="spin" /> Preparing page previews…</div>}
    {error && <p role="status" className="notice notice-muted">{error}</p>}
    {previews.length > 0 && <div className={`page-grid${onOrderChange ? ' page-grid-reorder' : ''}`}>
      {ordered.map((pageNumber, index) => {
        const preview = previews.find((item) => item.page === pageNumber);
        const checked = selected.includes(pageNumber);
        return <article key={pageNumber} className={`page-card${checked ? ' is-selected' : ''}`} draggable={!!onOrderChange && !disabled} onDragStart={() => setDragging(pageNumber)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragging !== null) move(dragging, pageNumber); setDragging(null); }} onDragEnd={() => setDragging(null)}>
          <button type="button" className="page-face" disabled={disabled} onClick={() => onToggle?.(pageNumber)} aria-pressed={onToggle ? checked : undefined} aria-label={onToggle ? `Page ${pageNumber}${checked ? ', selected' : ''}` : `Page ${pageNumber}`}>
            {preview && <img src={preview.url} alt={`Preview of page ${pageNumber}`} loading="lazy" />}
            {onToggle && <span className="page-check" aria-hidden="true">{checked && <Check size={14} />}</span>}
          </button>
          <span className="page-number">Page {pageNumber}</span>
          {onOrderChange && <div className="page-order-actions">
            <button type="button" className="icon-button" disabled={disabled || index === 0} aria-label={`Move page ${pageNumber} up`} onClick={() => move(pageNumber, ordered[index - 1])}><ArrowUp size={15} /></button>
            <button type="button" className="icon-button" disabled={disabled || index === ordered.length - 1} aria-label={`Move page ${pageNumber} down`} onClick={() => move(pageNumber, ordered[index + 1])}><ArrowDown size={15} /></button>
          </div>}
        </article>;
      })}
    </div>}
    {count > MAX_RENDER_PAGES && onToggle && <div className="range-fallback"><label htmlFor="fallback-page-range">Select pages by range</label><div className="field-row"><input id="fallback-page-range" disabled={disabled} value={range} onChange={(event) => setRange(event.target.value)} placeholder="For example 1-3, 7" /><button className="button button-secondary button-small" disabled={disabled} type="button" onClick={() => { try { const pages = range.split(',').flatMap((part) => { const [a,b] = part.trim().split('-').map(Number); if (!a || a > count || (b && (b > count || b < a))) throw new Error('Check that the page range is valid.'); return Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i); }); onSelectionChange?.([...new Set([...selected, ...pages])].sort((a, b) => a - b)); setError(''); } catch (reason) { setError(explainPdfError(reason)); } }}>Select pages</button></div></div>}
  </section>;
}

export function PrivacyNote() {
  return <div className="privacy-note"><LockKeyhole size={15} /><span>Your files are processed locally in your browser and are not uploaded to our servers.</span></div>;
}

export function StatusMessage({ error, busy, progress, children }: { error?: string; busy?: boolean; progress?: string; children?: ReactNode }) {
  if (error) return <div role="alert" className="notice notice-error">{error}</div>;
  if (busy) return <div role="status" aria-live="polite" className="notice notice-progress"><LoaderCircle size={17} className="spin" /><span>{progress || 'Working on your file…'}</span></div>;
  if (children) return <div role="status" className="notice notice-success"><Check size={17} /><span>{children}</span></div>;
  return null;
}

export function useToolProcessor() {
  const [files, setFilesState] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState<ToolOutput | null>(null);
  const [progress, setProgress] = useState('');
  const controller = useRef<AbortController | null>(null);
  const busyGuard = useRef(false);

  function setFiles(files: File[]) { setOutput(null); setError(''); setProgress(''); setFilesState(files); }

  async function run(action: (signal: AbortSignal) => Promise<ToolOutput>) {
    if (busyGuard.current) return;
    busyGuard.current = true;
    const active = new AbortController(); controller.current = active;
    setBusy(true); setError(''); setOutput(null); setProgress('Preparing…');
    try {
      const result = await action(active.signal);
      if (!active.signal.aborted) setOutput(result);
    } catch (reason) {
      if (!active.signal.aborted && !(reason instanceof DOMException && reason.name === 'AbortError')) setError(explainPdfError(reason));
    } finally {
      if (controller.current === active) { controller.current = null; busyGuard.current = false; setBusy(false); setProgress(''); }
    }
  }

  function reset() {
    controller.current?.abort(); controller.current = null; busyGuard.current = false;
    setBusy(false); setProgress(''); setError(''); setOutput(null); setFilesState([]);
  }

  return { files, setFiles, busy, error, output, progress, setProgress, run, reset };
}

export function OutputCard({ output }: { output: ToolOutput }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = output.files.map((file) => URL.createObjectURL(file.blob)); setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [output]);
  useEffect(() => {
    const next = (output.previewImages ?? []).slice(0, 8).map((file) => URL.createObjectURL(file.blob)); setPreviewUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [output]);
  return <section className="output-card" aria-label="Finished result">
    <div className="output-heading"><span className="output-check"><Check size={18} /></span><div><h3>{output.title}</h3><p>{output.details || 'Your file is ready to download.'}</p></div></div>
    <div className="download-list">{output.files.map((file, index) => <a className="button button-primary download-button" key={`${file.name}-${index}`} href={urls[index]} download={file.name}><FileImage size={17} />Download {file.name}<small>{formatBytes(file.blob.size)}</small><span aria-hidden="true">↓</span></a>)}</div>
    {output.previewImages && output.previewImages.length > 0 && <div className="converted-preview"><p className="eyebrow">Page previews</p><div>{output.previewImages.slice(0, 8).map((item, index) => <img key={item.name} src={previewUrls[index]} alt={`Preview ${item.name}`} />)}</div></div>}
  </section>;
}

export function ResetButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return <button className="button button-quiet reset-button" type="button" onClick={onClick} disabled={disabled}><RotateCcw size={15} />Start over</button>;
}
