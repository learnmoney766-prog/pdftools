import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const entry = await readFile(path.join(dist, 'index.html'), 'utf8');
assert.match(entry, /<div id="root"><\/div>/, 'Production entry must include the React mount element.');
assert.doesNotMatch(entry, /\/src\/main\.tsx/, 'Production entry must not reference the Vite development entry.');

const scripts = [...entry.matchAll(/<script\b[^>]*src="([^"]+\.js)"/g)].map((match) => match[1]);
const styles = [...entry.matchAll(/<link\b[^>]*href="([^"]+\.css)"/g)].map((match) => match[1]);
assert.ok(scripts.length, 'Production entry must reference a bundled JavaScript file.');
assert.ok(styles.length, 'Production entry must reference a bundled stylesheet.');
for (const asset of [...scripts, ...styles]) await access(path.join(dist, asset.replace(/^\//, '')));
await access(path.join(dist, 'add-watermark', 'index.html'));
await access(path.join(dist, 'pdfjs', 'standard_fonts', 'LiberationSans-Regular.ttf'));

console.log(`Verified production entry, ${scripts.length} JavaScript bundle(s), ${styles.length} stylesheet(s), direct tool route, and PDF.js font assets in ${dist}.`);
