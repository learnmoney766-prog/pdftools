# PDF Toolkit

PDF Toolkit is a free, client-side website for common PDF tasks. Files are read in the browser and are not uploaded to an application server. The app has no account system, analytics, or external PDF processing service.

## Features

### PDF organization

- Merge PDFs and reorder the input files.
- Split a PDF using page ranges such as `1-3, 7, 9-10`.
- Extract selected pages or delete selected pages.
- Reorder pages with drag and drop or accessible move buttons.
- Rotate selected pages or the whole document by 90°, 180°, or 270°.

### Conversion

- Convert JPG/JPEG or PNG images into a PDF, with image order, page size, and orientation controls.
- Render selected PDF pages as JPG or PNG and download the images in a ZIP file.
- Convert selectable PDF text to editable DOCX paragraphs or page-based XLSX worksheets, and convert each PDF page to a visual PowerPoint slide.

### Information and editing

- Count pages and inspect available PDF metadata.
- Extract selectable text, copy it, or download it as a text file. Scanned-image OCR is not included.
- Add page numbers or choose from 20 text watermark presets, custom typography/color, repeat patterns, and PNG/JPG/WEBP image marks.
- Activate Free Pro locally to unlock the advanced watermark styles. There is no payment or card flow; an ad placement is reserved for a future provider.
- Compress by rebuilding each page as a JPEG image and measure the actual file-size change.

## Technology

- React and TypeScript
- Vite
- `pdf-lib` for PDF editing and page operations
- Mozilla PDF.js for rendering, thumbnails, and text extraction
- JSZip for bundled page-image downloads
- docx, ExcelJS, and PptxGenJS for Office format generation
- Lucide icons and custom responsive CSS

PDF.js and each Office converter are dynamically imported when needed. The home page does not load the PDF editing, rendering, or Office generation engines.

Before a PDF download is exposed, the saved bytes are reopened with `pdf-lib` and the page count is checked. Image ZIP files are reopened and their entry names, sizes, MIME types, and PNG/JPEG signatures are validated. The repeatable integrity suite additionally reopens PDF output bytes with PDF.js and checks page content/order.

## Requirements

- Node.js 22.13+ or 24+
- pnpm 10+

## Development

```sh
pnpm install
pnpm dev
```

The development server prints its local URL. Use `pnpm run typecheck` to check TypeScript, `pnpm run qa:pdf-integrity` to reopen generated PDF fixtures with both `pdf-lib` and PDF.js, and `pnpm run build` to create the production build. The integrity command writes actual output files under `work/pdf-integrity/` so they can also be inspected with a separate PDF reader.

## Production build and deployment

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm preview
```

Deploy the `dist/` directory to a static host. Netlify settings are checked into `netlify.toml`: `pnpm run build`, publish directory `dist`, and Node.js 24. `package.json` pins pnpm 11.25.0. Netlify's `URL` build variable supplies the canonical origin and sitemap automatically. Other hosts can set `SITE_URL` to the public HTTPS origin; without either value the build omits absolute canonical tags and the sitemap rather than publishing placeholders. The running app sets canonical and Open Graph URLs from its actual origin.

Netlify uses the included `public/_redirects` SPA fallback as well as the generated direct-route HTML files. PDF processing, conversion, and downloads run entirely in the visitor's browser, so the app does not require Netlify Functions, API keys, a backend service, Python, or server-side filesystem access. Vercel can serve the generated route HTML files and uses clean URLs from `vercel.json`. GitHub Pages does not provide the same route fallback by default and needs a custom 404 fallback or a hash-based routing change.

## Routes

Each tool has its own direct URL:

`/merge-pdf`, `/split-pdf`, `/extract-pdf-pages`, `/delete-pdf-pages`, `/reorder-pdf-pages`, `/rotate-pdf`, `/jpg-to-pdf`, `/png-to-pdf`, `/pdf-to-jpg`, `/pdf-to-png`, `/compress-pdf`, `/pdf-page-counter`, `/pdf-metadata`, `/pdf-text-extractor`, `/add-page-numbers`, and `/add-watermark`.

The build creates a static HTML entry for each tool route, with unique title and description, Open Graph tags, a no-JavaScript content fallback, and FAQ structured data. React updates canonical and social metadata to match the active route.

## Privacy architecture

Selected documents are accessed through the browser File API. `pdf-lib`, PDF.js, the PDF.js worker, and JSZip run locally. The app does not send document bytes to the hosting provider or another processing service. Browser memory is used while a document is open and results are downloaded directly from the browser.

## Known limitations

- Browser support and available memory limit file size. PDFs are capped at 100 MB each. Images are capped at 25 MB each and 100 MB total per selection.
- Page thumbnails are generated for up to 80 pages. Larger files can use page ranges for extraction, deletion, or rotation; page reordering with previews is limited to 80 pages.
- PDF-to-image conversion and image-based compression are limited to 40 pages per operation to keep browser memory use bounded.
- DOCX, XLSX, and PPTX conversion are limited to 40 pages and 100 MB per PDF. Word paragraphs and table columns are inferred from PDF text positions; complex layout may need cleanup. Scanned pages need OCR, which is not included. PowerPoint slides are page images for visual fidelity, not editable page text. Mixed-size source pages are fitted proportionally onto widescreen slides.
- Compression rasterizes every page as JPEG. It removes selectable text, links, forms, vector detail, metadata, and accessibility structure, and may increase file size. The UI reports the measured result and does not promise a fixed reduction.
- Text extraction reads selectable PDF text only; it does not perform OCR.
- Watermark text is fitted to each page when needed. The built-in standard font supports Latin and Western European characters; unsupported Unicode is rejected with a clear error instead of creating a misleading download.
- PNG transparency is preserved in image watermarks. JPG and WEBP watermarks are converted to PNG in the browser before embedding. Free Pro activation is stored in this browser’s local storage and does not create a paid subscription. No advertising provider is configured in this project; the reserved ad area is a placeholder.
- Contact Us opens WhatsApp at the Ghana number +233 24 126 7186.
- Password-protected, malformed, and some uncommon PDF features may not be supported by the browser libraries.
- PNG transparency is displayed against a white background in the resulting PDF.
- The contact page intentionally does not invent a support address; add a real project contact before public launch.

## Adding a tool

1. Add the tool’s copy, route slug, input type, FAQ, and related links in `src/data/tools-data.json`, then update its TypeScript contract in `src/data/tools.ts` if needed.
2. Add its operation and controls in `src/pages/ToolPage.tsx`, reusing the file, page-preview, status, privacy, and download components in `src/components/ToolParts.tsx`.
3. Add the matching SEO route, category card icon, and any relevant page limits. The static-route build reads the tool list from the same data file.
4. Run `pnpm run typecheck`, `pnpm run build`, then exercise the tool with valid and invalid files in the browser.
