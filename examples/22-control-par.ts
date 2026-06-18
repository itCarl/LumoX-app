// 22 — Full end-to-end PAR control:
//   1. Load built-in library
//   2. Pick a generic RGBW PAR profile, patch one fixture
//   3. Open Art-Net broadcast + sACN multicast outputs
//   4. Run a color sequence using the fixture API
//   5. Print live DMX output
//
//   node examples/22-control-par.js

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Engine, ArtNetOutput, SacnOutput,
  FixtureLibrary, Patch, Fixture,
} from '../src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.resolve(__dirname, '..', 'fixtures');

// ---- 1. Library ---------------------------------------------------------
const library = new FixtureLibrary();
await library.loadFromDirectory(libDir);
console.log(`Library: ${library.list().length} profiles available`);

const profile = library.get('Generic/PAR RGBW 4ch');
if (!profile) throw new Error('Generic RGBW PAR not found in library');
console.log(`Using profile: ${profile.id}`);

// ---- 2. Engine + patch --------------------------------------------------
const engine = new Engine({ refreshHz: 44 });
engine.universes.ensure(0, 'Stage');

const patch = new Patch();
const par = patch.add(new Fixture({
  id: 'par1',
  definition: profile,
  universeId: 0,
  startAddress: 1,
}));
console.log(`Patched ${par.name} @ universe 0, channels ${par.startAddress}..${par.endAddress}`);

// Wire intensity-only mask so GrandMaster scales only intensity-class
// channels (would matter on a fixture with separate intensity + color).
// For a 4-ch RGBW PAR there are no `intensity` channels — `all` mode is fine.
engine.grandMaster!.mode = 'all';

// ---- 3. Outputs ---------------------------------------------------------
engine.outputs.add(new ArtNetOutput({
  name: 'Art-Net broadcast',
  host: '255.255.255.255',
  broadcast: true,
  subscribedUniverses: [0],
}));
engine.outputs.add(new SacnOutput({
  name: 'sACN multicast',
  mode: 'multicast',
  sourceName: 'Lumox PAR Demo',
  subscribedUniverses: [0],
}));

await engine.outputs.openAll();
engine.start();
console.log('Engine running. Sending Art-Net (UDP 6454) + sACN (UDP 5568).');

// ---- 4. Color sequence --------------------------------------------------
const sequence: { name: string; rgbw: [number, number, number, number] }[] = [
  { name: 'red',    rgbw: [255,   0,   0,   0] },
  { name: 'green',  rgbw: [  0, 255,   0,   0] },
  { name: 'blue',   rgbw: [  0,   0, 255,   0] },
  { name: 'amber',  rgbw: [255, 100,   0,   0] },
  { name: 'cyan',   rgbw: [  0, 255, 255,   0] },
  { name: 'white',  rgbw: [  0,   0,   0, 255] },
  { name: 'off',    rgbw: [  0,   0,   0,   0] },
];

let step = 0;
function nextColor() {
  const s = sequence[step % sequence.length];
  par.setRGBW(...s.rgbw);
  patch.applyAll(engine.universes);
  console.log(`Step ${step + 1}/${sequence.length}: ${s.name.padEnd(6)} → RGBW = ${s.rgbw.join(', ')}`);
  step++;
}
nextColor();
setInterval(nextColor, 1500);

// ---- 5. Live tick log ---------------------------------------------------
let tickCount = 0;
engine.on('tick', () => {
  if (++tickCount % 44 !== 0) return;  // once per second
  const u = engine.universes.get(0)!;
  console.log(`  ch1..4 (R G B W) = ${u.getChannel(1)} ${u.getChannel(2)} ${u.getChannel(3)} ${u.getChannel(4)}`);
});

// ---- Shutdown -----------------------------------------------------------
process.on('SIGINT', async () => {
  console.log('\nStopping…');
  par.setRGBW(0, 0, 0, 0); patch.applyAll(engine.universes);
  // Send one final frame so the fixture goes dark before we close sockets
  await new Promise((res) => setTimeout(res, 50));
  engine.stop();
  await engine.outputs.closeAll();
  process.exit(0);
});
