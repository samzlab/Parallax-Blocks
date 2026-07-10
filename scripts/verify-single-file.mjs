import { readdir, readFile } from 'node:fs/promises';

const files = await readdir(new URL('../dist/', import.meta.url));
if (files.length !== 1 || files[0] !== 'index.html') {
  throw new Error(`Expected only dist/index.html, received: ${files.join(', ')}`);
}
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
if (/<script[^>]+src=["']|<link[^>]+href=["'](?!data:)/i.test(html)) {
  throw new Error('Production HTML contains an external script or stylesheet.');
}
console.log(`Verified standalone dist/index.html (${Math.round(html.length / 1024)} KiB)`);
