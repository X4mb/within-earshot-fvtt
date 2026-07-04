/**
 * Copies built assets into the local Foundry VTT user data folder.
 * Runs automatically after `npm run build`.
 *
 * Override destination: set FOUNDRY_MODULE_PATH to the full `withinearshot` folder
 * (e.g. `D:/FoundryVTT/Data/modules/withinearshot`).
 */
import { cpSync, copyFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Folder must match module.json id (differs on the test branch: withinearshot-test). */
const moduleJson = JSON.parse(readFileSync(join(root, 'module.json'), 'utf8'));
const moduleId = moduleJson.id;
const entryFile = moduleJson.esmodules?.[0];

const dest =
  process.env.FOUNDRY_MODULE_PATH?.trim() ||
  (() => {
    const local = process.env.LOCALAPPDATA;
    if (!local) return null;
    return join(local, 'FoundryVTT', 'Data', 'modules', moduleId);
  })();

if (!dest) {
  console.warn(
    '[withinearshot] Skip Foundry deploy: set LOCALAPPDATA (Windows) or FOUNDRY_MODULE_PATH to your Data/modules/withinearshot folder.',
  );
  process.exit(0);
}

if (!entryFile || !existsSync(join(root, entryFile))) {
  console.error(`[withinearshot] ${entryFile ?? 'esmodules entry'} missing — run the build first.`);
  process.exit(1);
}

// Bundle filenames are version-stamped; clear the old dist so stale versions don't pile up.
rmSync(join(dest, 'dist'), { recursive: true, force: true });
mkdirSync(join(dest, 'dist'), { recursive: true });
mkdirSync(join(dest, 'lang'), { recursive: true });
cpSync(join(root, 'dist'), join(dest, 'dist'), { recursive: true });
cpSync(join(root, 'lang'), join(dest, 'lang'), { recursive: true });
copyFileSync(join(root, 'module.json'), join(dest, 'module.json'));
console.log(`[withinearshot] Deployed -> ${dest}`);
