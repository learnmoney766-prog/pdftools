import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, Combine, FileImage, FileSearch, FileSpreadsheet, FileText, FileType2, Hash, Image, LockKeyhole, Minimize2, Presentation, RotateCw, ScanText, Scissors, Search, ShieldCheck, Stamp, WandSparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { categories, tools, toolHref } from '../data/tools';
import type { ToolSlug } from '../data/tools';
import { useSeo } from '../useSeo';

const icons: Record<ToolSlug, typeof FileText> = {
  'merge-pdf': Combine, 'split-pdf': Scissors, 'extract-pdf-pages': FileSearch, 'delete-pdf-pages': FileText,
  'reorder-pdf-pages': WandSparkles, 'rotate-pdf': RotateCw, 'jpg-to-pdf': Image, 'png-to-pdf': Image,
  'pdf-to-jpg': FileImage, 'pdf-to-png': FileImage, 'pdf-to-word': FileType2, 'pdf-to-excel': FileSpreadsheet, 'pdf-to-powerpoint': Presentation, 'compress-pdf': Minimize2, 'pdf-page-counter': Hash,
  'pdf-metadata': FileSearch, 'pdf-text-extractor': ScanText, 'add-page-numbers': Hash, 'add-watermark': Stamp,
};

export default function HomePage() {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useSeo('Free PDF Tools | PDF Toolkit', 'Merge, split, convert, organize, and edit PDF files in your browser. Free PDF tools with no account and no file uploads.', '/');
  const filtered = useMemo(() => tools.filter((tool) => `${tool.title} ${tool.description} ${tool.category}`.toLowerCase().includes(query.toLowerCase().trim())), [query]);
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '') && !target?.isContentEditable) {
        event.preventDefault(); searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  return <main>
    <section className="hero-wrap">
      <div className="hero-grid page-shell">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="status-dot" />Your everyday PDF toolbox</div>
          <h1>Free PDF <span>Tools</span></h1>
          <p className="hero-lede">Get common PDF jobs done without the hassle. Merge, organize, convert, or tidy up your files right in your browser.</p>
          <div className="hero-actions"><a className="button button-primary hero-cta" href="#tools">Choose a PDF tool <ArrowDown size={17} /></a><span className="hero-assurance"><LockKeyhole size={14} /> Files stay on your device</span></div>
          <div className="hero-proof"><span><Check size={14} />Free to use</span><span><Check size={14} />No account</span><span><Check size={14} />Private by design</span></div>
        </div>
        <div className="hero-visual" aria-label="Choose, process, and save a PDF in three steps">
          <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
          <div className="workflow-card">
            <div className="workflow-top"><div><span className="eyebrow">A clear path through</span><h2>PDF, done.</h2></div><span className="workflow-spark"><WandSparkles size={17} /></span></div>
            <div className="workflow-steps">
              <div className="workflow-step"><span className="step-glyph glyph-file"><FileText size={19} /></span><span><strong>Choose a tool</strong><small>Pick what you need</small></span><span className="step-number">01</span></div>
              <span className="step-connector" />
              <div className="workflow-step"><span className="step-glyph glyph-process"><WandSparkles size={19} /></span><span><strong>Make your changes</strong><small>Right here in your browser</small></span><span className="step-number">02</span></div>
              <span className="step-connector" />
              <div className="workflow-step"><span className="step-glyph glyph-save"><Check size={19} /></span><span><strong>Save your result</strong><small>Download when you're ready</small></span><span className="step-number">03</span></div>
            </div>
            <div className="workflow-foot"><ShieldCheck size={16} /><span>Local processing on every tool</span><span className="workflow-foot-dot" /></div>
          </div>
          <div className="floating-chip chip-pages"><FileText size={15} /><span>Pages in order</span><span className="chip-check"><Check size={12} /></span></div>
          <div className="floating-chip chip-private"><LockKeyhole size={15} /><span>Your files stay yours</span></div>
        </div>
      </div>
      <div className="hero-bottom-rule page-shell"><span>Good tools, no extra steps.</span><span>Browse all tools <ArrowDown size={14} /></span></div>
    </section>

    <section className="tools-section page-shell" id="tools">
      <div className="section-heading"><div><span className="eyebrow">The toolbox</span><h2>Find the right tool.<br /><span>Get on with your day.</span></h2></div><p>Small, useful PDF tools for the things you need to do most often. Pick one to get started.</p></div>
      <div className="tool-search"><Search size={18} /><label className="visually-hidden" htmlFor="tool-search">Search PDF tools</label><input ref={searchRef} id="tool-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools by name or task…" /><kbd>/</kbd></div>
      <div className="tool-category-list">{categories.map((category) => {
        const list = filtered.filter((tool) => tool.category === category);
        if (list.length === 0) return null;
        const id = category.toLowerCase().replaceAll(' ', '-');
        return <section key={category} id={id} className="tool-category">
          <div className="category-heading"><div><span className="category-mark" /><h3>{category}</h3></div><span>{list.length.toString().padStart(2, '0')} tools</span></div>
          <div className="tool-card-grid">{list.map((tool, index) => {
            const Icon = icons[tool.slug];
            return <Link className="tool-card" to={toolHref(tool.slug)} key={tool.slug}>
              <span className={`tool-icon tool-icon-${index % 5}`}><Icon size={20} strokeWidth={1.8} /></span>
              <span className="tool-card-copy"><strong>{tool.shortTitle}</strong><span>{tool.description}</span></span>
              <span className="tool-card-arrow"><ArrowRight size={17} /></span>
            </Link>;
          })}</div>
        </section>;
      })}</div>
      {filtered.length === 0 && <div className="empty-search"><span><Search size={20} /></span><h3>No tools found</h3><p>Try a different word, or browse all of the available tools.</p><button type="button" className="button button-secondary" onClick={() => setQuery('')}>Clear search</button></div>}
    </section>

    <section className="privacy-band"><div className="page-shell privacy-band-inner"><span className="privacy-band-icon"><ShieldCheck size={23} /></span><div><span className="eyebrow">Privacy is the default</span><h2>Your documents stay with you.</h2><p>PDFs are processed locally in your browser, then you save the finished file directly to your device. No account, no upload queue, no detour.</p></div><Link className="button button-outline-light" to="/privacy">How privacy works <ArrowRight size={15} /></Link></div></section>

    <section className="closing-cta page-shell"><div className="closing-decoration"><FileText size={40} /><span><Check size={12} /></span></div><div><span className="eyebrow">Ready when you are</span><h2>What do you need to do with your PDF?</h2><p>Find a tool above and get started. Your files stay in your browser.</p></div><a href="#tools" className="button button-primary">Browse the tools <ArrowRight size={16} /></a></section>
  </main>;
}
