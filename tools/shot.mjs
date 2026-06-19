// `npm run shot` — build-if-stale, set a sane env, and launch a screenshot
// scenario under Electron. Removes the long PowerShell incantation and the
// ELECTRON_RUN_AS_NODE / LUMOX_SEED footguns from the screenshot loop.
//
//   npm run shot                 # default scenario (fader)
//   npm run shot -- limits       # one scenario by name (see scenarios/)
//   npm run shot -- all          # every scenario + a contact-sheet.png montage
//   npm run shot -- path/to/x.cjs  # a throwaway scenario (e.g. wires/scratch/)
//   npm run shot -- limits --no-build   # skip the staleness rebuild
//
// Output → .shots/ (override with LUMOX_SHOT_DIR).

import { spawnSync } from 'node:child_process';
import { statSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';   // in plain Node this resolves to the binary path

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRIVER = path.join(ROOT, '.claude', 'skills', 'run-app', 'shot.cjs');
const MAIN = path.join(ROOT, 'dist', 'main', 'index.cjs');
const REGISTRY = path.join(ROOT, '.claude', 'skills', 'run-app', 'scenarios');

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const scenario = args.find((a) => !a.startsWith('--')) || 'fader';

// ---- build if stale -----------------------------------------------------
// Newest mtime under the app sources vs. the built main. esbuild is fast and
// idempotent, so when in doubt we rebuild; --no-build skips it entirely.
function newestMtime(p) {
  const st = statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = st.mtimeMs;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    newest = Math.max(newest, newestMtime(path.join(p, e.name)));
  }
  return newest;
}
function isStale() {
  if (!existsSync(MAIN)) return true;
  const built = statSync(MAIN).mtimeMs;
  const src = Math.max(...['main', 'src', 'renderer', 'preload.ts', 'build.mjs'].map((p) => newestMtime(path.join(ROOT, p))));
  return src > built;
}
if (!noBuild && isStale()) {
  console.log('[shot] sources changed — building…');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build.mjs')], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { console.error('[shot] build failed'); process.exit(r.status ?? 1); }
} else if (!noBuild) {
  console.log('[shot] build up to date');
}

// ---- env + launch -------------------------------------------------------
// LUMOX_DEV=1 enables the main-process eval bridge (window.lumox.dev) that
// scenarios use for engine introspection; LUMOX_SEED=1 forces the demo rig so
// shots have content; ELECTRON_RUN_AS_NODE must be unset (it makes the main bail).
const env = { ...process.env, LUMOX_SEED: process.env.LUMOX_SEED ?? '1', LUMOX_DEV: '1' };
delete env.ELECTRON_RUN_AS_NODE;

function launch(scn) {
  const r = spawnSync(electron, [DRIVER, scn], { cwd: ROOT, stdio: 'inherit', env });
  return r.status ?? 0;
}

if (scenario === 'all') {
  // Read scenario names without importing the .cjs registry into this ESM file.
  const registryNames = readdirSync(REGISTRY)
    .filter((f) => f.endsWith('.cjs') && f !== 'index.cjs')
    .map((f) => f.replace(/\.cjs$/, ''));
  console.log('[shot] running all scenarios: ' + registryNames.join(', '));
  for (const name of registryNames) { console.log('\n[shot] === ' + name + ' ==='); launch(name); }
  console.log('\n[shot] === contact sheet ===');
  process.exit(launch('__contact'));
} else {
  process.exit(launch(scenario));
}
