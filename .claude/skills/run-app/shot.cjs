// Scenario runner — boots the real Lumox main and runs ONE screenshot scenario,
// resolved by name from ./scenarios, or by path to a throwaway .cjs. Prefer the
// `npm run shot` wrapper (tools/shot.mjs) which builds + sets the env first; this
// file is the thing it launches under Electron.
//
//   electron .claude/skills/run-app/shot.cjs <name|path|__contact>
//
// Special scenario `__contact` composites every registry `cover` shot already in
// .shots/ into one contact-sheet.png (run it after the others — the wrapper's
// `all` mode does exactly that).

const path = require('node:path');
const H = require('./harness.cjs');
const SCENARIOS = require('./scenarios/index.cjs');

const arg = process.argv[2] || process.env.LUMOX_SCENARIO || 'fader';

H.boot();

if (arg === '__contact') {
  const entries = Object.entries(SCENARIOS)
    .filter(([, s]) => s.cover)
    .map(([name, s]) => ({ file: s.cover, label: name }));
  H.montage(entries, 'contact-sheet', (m) => console.log('[shot]', m));
} else {
  // A path ending in .cjs is a throwaway scenario (e.g. in wires/scratch/);
  // otherwise look the name up in the registry.
  let scenario, logName;
  if (arg.endsWith('.cjs')) {
    scenario = require(path.resolve(arg));
    logName = 'driver-' + path.basename(arg, '.cjs') + '.log';
  } else {
    scenario = SCENARIOS[arg];
    logName = 'driver-' + arg + '.log';
    if (!scenario) {
      console.error(`[shot] unknown scenario "${arg}". Known: ${Object.keys(SCENARIOS).join(', ')}, __contact`);
      process.exit(1);
    }
  }
  H.run(scenario, logName);
}
