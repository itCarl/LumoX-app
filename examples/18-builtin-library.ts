// 18 — Load shipped fixture library from disk and patch one of them.
// All profiles in `lumox-app/fixtures/` are loaded via the registered
// importers (Lumox JSON here; .qxf files would work too).
//
//   node examples/18-builtin-library.js

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine, FixtureLibrary, Patch, Fixture } from '../src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.resolve(__dirname, '..', 'fixtures');

const lib = new FixtureLibrary();
const result = await lib.loadFromDirectory(libDir, { source: 'builtin' });
console.log(`Loaded ${result.loaded} profiles (skipped ${result.skipped}, errors ${result.errors.length})`);

if (result.errors.length) console.log('Errors:', result.errors);

console.log('\nGeneric PARs:');
for (const d of lib.find({ type: 'PAR' })) console.log('  •', d.id);

console.log('\nGeneric Moving Heads:');
for (const d of lib.find({ type: 'Moving Head' })) console.log('  •', d.id);

console.log('\nManufacturers:', lib.manufacturers().join(', '));

console.log('\nStairville profiles:');
for (const d of lib.find({ manufacturer: 'Stairville' })) {
  console.log(`  • ${d.id}  — modes: ${d.modes.map((m) => m.name).join(' | ')}`);
}

// Pick the 11ch mover, patch one instance, push a color into the universe
const def = lib.get('Generic/Moving Head RGBW 11ch');
if (!def) {
  console.error('Mover not found — library load failed?');
  process.exit(1);
}

const engine = new Engine({ refreshHz: 5 });
const uni = engine.universes.ensure(0, 'Library Demo');

const patch = new Patch();
patch.add(new Fixture({ id: 'mh1', definition: def, universeId: 0, startAddress: 1 }));

const mh = patch.get('mh1')!;
mh.set('intensity', 255);
mh.set('shutter',   255);
mh.setRGBW(255, 80, 0, 0);
mh.setPanTilt(0x7fff, 0x7fff);
patch.applyAll(engine.universes);

engine.on('tick', () => {
  console.log('uni0 ch1..11 =',
    [...Array(11)].map((_, i) => uni.getChannel(i + 1)).join(' '));
});

engine.start();
process.on('SIGINT', () => { engine.stop(); process.exit(0); });
