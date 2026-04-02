/** Build module.zip: root contains module.json, dist/, lang/, LICENSE (for GitHub Release + manifest download). */
import { createWriteStream, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'module.zip');

if (!existsSync(join(root, 'dist', 'withinearshot.js'))) {
  console.error('[withinearshot] dist/withinearshot.js missing — run npm run build first.');
  process.exit(1);
}

const output = createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

archive.pipe(output);
archive.file(join(root, 'module.json'), { name: 'module.json' });
archive.file(join(root, 'LICENSE'), { name: 'LICENSE' });
archive.directory(join(root, 'dist'), 'dist');
archive.directory(join(root, 'lang'), 'lang');

await new Promise((resolve, reject) => {
  output.on('close', resolve);
  archive.on('error', reject);
  archive.finalize();
});

console.log(`[withinearshot] Wrote ${outPath} (${archive.pointer()} bytes)`);
