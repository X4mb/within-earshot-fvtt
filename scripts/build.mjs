/**
 * Bundle to a version-stamped filename (dist/withinearshot-<version>.js) and point
 * module.json esmodules at it.
 *
 * Why: Foundry loads module scripts without any cache-busting query, and the game server
 * (dnd.xamb.at) sits behind Cloudflare whose default browser TTL is 4h — after an update,
 * browsers kept executing the previous bundle for hours. A new filename per version makes
 * that impossible.
 */
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = join(root, 'module.json');
const moduleJson = JSON.parse(readFileSync(modulePath, 'utf8'));
const outName = `withinearshot-${moduleJson.version}.js`;
const distDir = join(root, 'dist');

mkdirSync(distDir, { recursive: true });
for (const f of readdirSync(distDir)) {
  if (/^withinearshot.*\.js(\.map)?$/.test(f) && f !== outName && f !== `${outName}.map`) {
    rmSync(join(distDir, f));
  }
}

await esbuild.build({
  entryPoints: [join(root, 'src', 'module.ts')],
  bundle: true,
  outfile: join(distDir, outName),
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  sourcemap: true,
  logLevel: 'info',
});

const esmodules = [`dist/${outName}`];
if (JSON.stringify(moduleJson.esmodules) !== JSON.stringify(esmodules)) {
  moduleJson.esmodules = esmodules;
  writeFileSync(modulePath, JSON.stringify(moduleJson, null, 2) + '\n');
  console.log(`[withinearshot] module.json esmodules -> dist/${outName}`);
}
