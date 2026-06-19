// esbuild build for the Electron APP. tsc handles type-checking (npm run
// typecheck); esbuild handles transpilation + bundling (fast, type-stripping).
//
// Outputs:
//   dist/main/index.cjs       Electron main (CJS, Node)
//   dist/preload.cjs          Electron preload (CJS — sandboxed preload req.)
//   renderer/dist/*.js        renderer bundles (ESM, browser)
//
// Node scripts (headless, cli, examples) are NOT bundled — they run from
// source via `tsx` (see package.json), which keeps their repo-relative paths
// (fixtures/, project files) correct.
//
// `node build.mjs --watch` rebuilds on change. Add `--serve` to also launch
// Electron via electronmon, which restarts on main-process changes and reloads
// the renderer when its bundle/CSS rebuild — this is what `npm run dev` uses.

import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const serve = process.argv.includes('--serve');

// Tailwind — compile renderer/styles/tailwind.css → renderer/dist/tailwind.css.
// esbuild can't run Tailwind, so we shell out to its CLI. In --watch it runs
// alongside the esbuild watchers (not awaited); otherwise we await one build.
function runTailwind() {
  const win = process.platform === 'win32';
  const bin = path.join('node_modules', '.bin', win ? 'tailwindcss.cmd' : 'tailwindcss');
  const args = [
    '-i', 'renderer/styles/tailwind.css',
    '-o', 'renderer/dist/tailwind.css',
    ...(watch ? ['--watch'] : ['--minify']),
  ];
  const child = spawn(bin, args, { stdio: 'inherit', shell: win });
  if (watch) return Promise.resolve();
  return new Promise((resolve, reject) => {
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`tailwind exited ${code}`)));
  });
}

// Vendor Font Awesome (offline webfont) into the renderer build output. The app
// is offline (no CDN), so the icon font ships with the build. The renderer links
// ./dist/fontawesome/css/all.min.css; that CSS's `../webfonts/` urls then resolve
// to the copied webfonts dir. dist/ is gitignored, so this is regenerated, never
// committed.
function copyFontAwesome() {
  const src = path.join('node_modules', '@fortawesome', 'fontawesome-free');
  const dest = path.join('renderer', 'dist', 'fontawesome');
  fs.mkdirSync(path.join(dest, 'css'), { recursive: true });
  fs.copyFileSync(path.join(src, 'css', 'all.min.css'), path.join(dest, 'css', 'all.min.css'));
  fs.cpSync(path.join(src, 'webfonts'), path.join(dest, 'webfonts'), { recursive: true });
}

// Launch Electron through electronmon (watch mode only). electronmon hard-
// restarts the app on main/preload changes and soft-reloads renderer windows
// when their esbuild bundle / Tailwind CSS rebuild. Exiting it stops the watch.
function runElectron() {
  const win = process.platform === 'win32';
  const bin = path.join('node_modules', '.bin', win ? 'electronmon.cmd' : 'electronmon');
  const child = spawn(bin, ['.'], { stdio: 'inherit', shell: win });
  child.on('exit', (code) => process.exit(code ?? 0));
}

/** @type {import('esbuild').BuildOptions[]} */
const configs = [
  // Main is CJS. Electron's `electron` module is CJS with no named ESM exports;
  // emitting CJS lets esbuild compile `import { app } from 'electron'` straight
  // to `require('electron').app` (the real API), and gives us a native runtime
  // `__dirname` for resolving APP_ROOT / preload paths.
  {
    platform: 'node',
    format: 'cjs',
    bundle: true,
    target: 'node20',
    sourcemap: true,
    logLevel: 'info',
    external: ['electron', 'easymidi'],
    entryPoints: ['main/index.ts'],
    outfile: 'dist/main/index.cjs',
  },
  // Preload must be CommonJS — Electron does not load ESM preload scripts.
  {
    platform: 'node',
    format: 'cjs',
    bundle: true,
    target: 'node20',
    sourcemap: true,
    logLevel: 'info',
    external: ['electron'],
    entryPoints: ['preload.ts'],
    outfile: 'dist/preload.cjs',
  },
  // Renderer — browser ESM, two HTML entry points.
  {
    platform: 'browser',
    format: 'esm',
    bundle: true,
    target: 'es2022',
    sourcemap: true,
    logLevel: 'info',
    entryPoints: ['renderer/index.ts', 'renderer/fixtureeditor-window.ts'],
    outdir: 'renderer/dist',
  },
];

copyFontAwesome();

if (watch) {
  const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
  // Build once up front so Electron has output to load, then enable watching
  // (esbuild's watch() does not guarantee the initial build has finished).
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.watch()));
  runTailwind();
  console.log('[build] watching…');
  if (serve) runElectron();
} else {
  await Promise.all([...configs.map((c) => esbuild.build(c)), runTailwind()]);
  console.log('[build] done');
}
