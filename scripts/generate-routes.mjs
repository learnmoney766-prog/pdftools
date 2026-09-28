import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await cp(path.join(root, 'node_modules', 'pdfjs-dist', 'standard_fonts'), path.join(dist, 'pdfjs', 'standard_fonts'), { recursive: true });
const tools = JSON.parse(await readFile(path.join(root, 'src/data/tools-data.json'), 'utf8'));
const template = await readFile(path.join(dist, 'index.html'), 'utf8');
const baseUrl = process.env.SITE_URL?.trim() || process.env.VITE_SITE_URL?.trim() || process.env.URL?.trim() || '';
let origin = '';
if (baseUrl) {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'https:') throw new Error('Set SITE_URL to the public HTTPS origin, for example https://pdf-tools.yourdomain.com.');
  origin = parsed.origin;
}

const pages = [
  ...tools.map((tool) => ({ path: `/${tool.slug}`, title: `${tool.title} | PDF Toolkit`, description: tool.description })),
  { path: '/about', title: 'About PDF Toolkit', description: 'Simple browser-based tools for everyday PDF jobs.' },
  { path: '/privacy', title: 'Privacy | PDF Toolkit', description: 'Learn how PDF Toolkit handles files and browser data.' },
  { path: '/terms', title: 'Terms | PDF Toolkit', description: 'Usage notes and limitations for PDF Toolkit.' },
  { path: '/contact', title: 'Contact | PDF Toolkit', description: 'Contact information for PDF Toolkit.' },
];

for (const page of pages) {
  const target = path.join(dist, page.path.slice(1), 'index.html');
  await mkdir(path.dirname(target), { recursive: true });
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`);
  html = setMeta(html, 'name', 'description', page.description);
  html = setMeta(html, 'property', 'og:title', page.title);
  html = setMeta(html, 'property', 'og:description', page.description);
  html = setMeta(html, 'property', 'og:type', 'website');
  html = removeMeta(html, 'property', 'og:url');
  if (origin) html = insertHead(html, `<link rel="canonical" href="${origin}${page.path}" />\n    <meta property="og:url" content="${origin}${page.path}" />`);
  const tool = tools.find((item) => `/${item.slug}` === page.path);
  if (tool) {
    const howTo = tool.howTo.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
    const faqs = tool.faqs.map((item) => `<section><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></section>`).join('');
    const related = tool.related.map((slug) => { const item = tools.find((candidate) => candidate.slug === slug); return item ? `<li><a href="/${item.slug}">${escapeHtml(item.shortTitle)}</a></li>` : ''; }).join('');
    const fallback = `<noscript><main><p>${escapeHtml(tool.category)}</p><h1>${escapeHtml(tool.title)}</h1><p>${escapeHtml(tool.intro)}</p><h2>How to use ${escapeHtml(tool.shortTitle)}</h2><ol>${howTo}</ol><h2>Frequently asked questions</h2>${faqs}<h2>Related tools</h2><ul>${related}</ul></main></noscript>`;
    html = html.replace('<div id="root"></div>', `<div id="root"></div>${fallback}`);
    const faqSchema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: tool.faqs.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) };
    const structuredData = `<script type="application/ld+json">${JSON.stringify(faqSchema).replaceAll('<', '\\u003c')}</script>`;
    html = insertHead(html, structuredData);
  }
  await writeFile(target, html);
}

const robots = `User-agent: *\nAllow: /\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`;
await writeFile(path.join(dist, 'robots.txt'), robots);
const sitemapPath = path.join(dist, 'sitemap.xml');
if (origin) {
  const locations = ['/', ...pages.map((page) => page.path)].map((page) => `  <url><loc>${escapeXml(origin + page)}</loc></url>`).join('\n');
  await writeFile(sitemapPath, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations}\n</urlset>\n`);
} else {
  await rm(sitemapPath, { force: true });
}
console.log(`Generated ${pages.length} direct-route HTML pages${origin ? ` and sitemap for ${origin}` : '; set SITE_URL during deployment to generate canonical URLs and sitemap'}.`);

function setMeta(html, attribute, key, content) {
  const escapedKey = escapeRegExp(key);
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${escapedKey}["'][^>]*>`, 'i');
  const tag = `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(content)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : insertHead(html, tag);
}

function removeMeta(html, attribute, key) {
  const escapedKey = escapeRegExp(key);
  return html.replace(new RegExp(`\\s*<meta\\s+${attribute}=["']${escapedKey}["'][^>]*>`, 'i'), '');
}

function insertHead(html, content) { return html.replace('</head>', `    ${content}\n  </head>`); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function escapeHtml(value) { return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
function escapeXml(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
