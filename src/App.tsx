import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ChevronDown, FileText, Menu, X } from 'lucide-react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import { categories, toolHref } from './data/tools';
import { useSeo } from './useSeo';

const ToolRoute = lazy(() => import('./pages/ToolPage').then((module) => ({ default: module.ToolRoute })));

export default function App() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  useEffect(() => {
    setMobileOpen(false); setCategoriesOpen(false);
    if (location.hash) {
      requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }));
    } else if (location.pathname !== '/') window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);
  return <div className="app-shell">
    <Header mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} categoriesOpen={categoriesOpen} setCategoriesOpen={setCategoriesOpen} />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/:slug" element={<Suspense fallback={<ToolLoading />}><ToolRoute /></Suspense>} />
      <Route path="/about" element={<InfoPage kind="about" />} />
      <Route path="/privacy" element={<InfoPage kind="privacy" />} />
      <Route path="/terms" element={<InfoPage kind="terms" />} />
      <Route path="/contact" element={<InfoPage kind="contact" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    <Footer />
  </div>;
}

function Header({ mobileOpen, setMobileOpen, categoriesOpen, setCategoriesOpen }: {
  mobileOpen: boolean; setMobileOpen: (open: boolean) => void; categoriesOpen: boolean; setCategoriesOpen: (open: boolean) => void;
}) {
  return <header className="site-header">
    <div className="header-inner">
      <Link to="/" className="brand" aria-label="PDF Toolkit home"><span className="brand-mark"><FileText size={20} strokeWidth={2.1} /><i /></span><span>pdf<span className="brand-accent">toolkit</span></span></Link>
      <nav className={`primary-nav${mobileOpen ? ' nav-open' : ''}`} aria-label="Main navigation">
        <NavLink to="/" end>Home</NavLink>
        <Link to="/#tools">All tools</Link>
        <div className="nav-menu-wrap">
          <button className="nav-menu-trigger" type="button" aria-expanded={categoriesOpen} onClick={() => setCategoriesOpen(!categoriesOpen)}>Categories <ChevronDown size={14} /></button>
          {categoriesOpen && <div className="category-popover">{categories.map((category) => <a key={category} href={`/#${category.toLowerCase().replaceAll(' ', '-')}`}>{category}<ArrowRight size={14} /></a>)}</div>}
        </div>
        <NavLink to="/about">About</NavLink>
        <NavLink to="/privacy">Privacy</NavLink>
        <NavLink to="/contact">Contact</NavLink>
        <a className="mobile-nav-cta" href="/#tools">Find a tool <ArrowDown size={15} /></a>
      </nav>
      <a className="header-cta" href="/#tools">Explore tools <ArrowRight size={15} /></a>
      <button className="mobile-menu-toggle" aria-label={mobileOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileOpen} type="button" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
    </div>
  </header>;
}

function ToolLoading() {
  useSeo('Loading PDF tool | PDF Toolkit', 'Your PDF tool is loading.', window.location.pathname);
  return <main className="page-shell tool-loading"><span className="loading-orbit" /><p>Preparing your tool…</p></main>;
}

function NotFoundPage() {
  useSeo('Page not found | PDF Toolkit', 'The page you requested could not be found.', window.location.pathname);
  return <main className="page-shell not-found"><span className="eyebrow">Not found</span><h1>This page has wandered off.</h1><p>Try another PDF tool or head back to the homepage.</p><Link className="button button-primary" to="/">Browse PDF tools <ArrowRight size={16} /></Link></main>;
}

function InfoPage({ kind }: { kind: 'about' | 'privacy' | 'terms' | 'contact' }) {
  const content = {
    about: { title: 'About PDF Toolkit', description: 'Simple browser-based tools for everyday PDF jobs.', h1: 'Make PDF jobs a little simpler.', intro: 'PDF Toolkit is a small collection of practical tools for common document tasks. The interface is designed to get you from choosing a tool to saving a result with as few steps as possible.', sections: [['A straightforward toolkit', 'Merge, split, convert, inspect, and make small edits to PDFs in one place. Tools are available without an account.'], ['Built around your browser', 'Where a tool can work locally, it reads your files in this browser tab and returns the result directly to you. There is no PDF upload service behind the tools.']] },
    privacy: { title: 'Privacy | PDF Toolkit', description: 'Learn how PDF Toolkit handles files and browser data.', h1: 'Your files stay on your device.', intro: 'The PDF tools read selected files using browser APIs and run document processing in your browser. PDF documents are not uploaded to a PDF Toolkit server.', sections: [['Files and processing', 'Files you select remain in this browser session. The site does not create accounts, retain uploaded PDFs, or send document contents to a server. Downloaded results are created in the browser. Closing the tab releases the app’s references to the files.'], ['Site requests', 'The deployed website host receives ordinary requests for the site’s HTML, code, and static assets. This project does not include analytics, advertising, or external PDF processing scripts.'], ['Limits', 'Browser memory and device performance affect the size and complexity of files that can be processed. The compressor converts pages to images; image conversion and compression can use significant memory.']] },
    terms: { title: 'Terms | PDF Toolkit', description: 'Usage notes and limitations for PDF Toolkit.', h1: 'A few things to know.', intro: 'PDF Toolkit is provided as a free browser-based utility. Review the result before relying on it for an important document.', sections: [['Use and responsibility', 'You are responsible for having the right to use the documents you process and for checking downloaded results before sharing or relying on them.'], ['No guarantee of compatibility', 'PDF features vary. Password-protected, damaged, unusually complex, or very large files may not work in every browser. Keep your original file and use a trusted PDF reader to verify important edits.'], ['Changes', 'The available tools and their limits may change as the project develops.']] },
    contact: { title: 'Contact | PDF Toolkit', description: 'Contact information for PDF Toolkit.', h1: 'Get in touch.', intro: 'This release does not have a support inbox or contact form configured. No contact details have been published for this project yet.', sections: [['Feedback', 'If you maintain this deployment, add a real support address or feedback link here before inviting visitors to contact the project. The site does not collect or forward messages.']] },
  }[kind];
  useSeo(content.title, content.description, `/${kind}`);
  return <main className="page-shell info-page"><div className="breadcrumbs"><Link to="/">Home</Link><span aria-hidden="true">/</span><span>{kind}</span></div><span className="eyebrow">PDF Toolkit</span><h1>{content.h1}</h1><p className="info-intro">{content.intro}</p><div className="info-sections">{content.sections.map(([title, body]) => <article key={title}><h2>{title}</h2><p>{body}</p></article>)}</div></main>;
}

function Footer() {
  return <footer className="site-footer">
    <div className="footer-inner">
      <div className="footer-brand"><Link to="/" className="brand"><span className="brand-mark"><FileText size={20} strokeWidth={2.1} /><i /></span><span>pdf<span className="brand-accent">toolkit</span></span></Link><p>Free PDF tools. Simple. Fast. Private.</p><span className="footer-privacy"><FileText size={14} />Files stay on your device</span></div>
      <div className="footer-col"><h2>Tools</h2><Link to="/#tools">All PDF tools</Link><Link to={toolHref('merge-pdf')}>Merge PDF</Link><Link to={toolHref('split-pdf')}>Split PDF</Link><Link to={toolHref('compress-pdf')}>Compress PDF</Link></div>
      <div className="footer-col"><h2>Explore</h2><Link to="/about">About</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/contact">Contact</Link></div>
      <div className="footer-note"><span>Made for the everyday PDF.</span><p>Use the tools, save your result, and get back to your day.</p></div>
    </div>
    <div className="footer-legal"><span>© {new Date().getFullYear()} PDF Toolkit</span><span>Free PDF tools, with your files kept local</span></div>
  </footer>;
}
