// `npm run frame` — headless DMX assertions without Electron or a screenshot.
//
// Builds a representative rig, drives it to full via the programmer, ticks the
// REAL engine once, and prints the mixed universe buffer (post-MixPipeline) —
// then applies per-fixture limits and prints it again, so the limits/output math
// is diffable in plain text. Reuses main/context (pure — no Electron) so the
// limit-resolution path is exactly the app's.
//
//   npm run frame            # human-readable raw → limited table
//   npm run frame -- --json  # machine-readable JSON
//
// Editable on purpose: change the rig / limits below to assert any engine case.

import { FixtureDefinition, FixtureMode, ChannelDefinition, Fixture } from '../src/index';
import { engine, show, rebuildFixtureMaps } from '../main/context';

const json = process.argv.includes('--json');
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---- rig ----------------------------------------------------------------
const mover = new FixtureDefinition({
  manufacturer: 'Demo', model: 'RGBW Mover', type: 'Moving Head',
  modes: [new FixtureMode({ name: '7ch', channels: [
    new ChannelDefinition({ name: 'Pan', typeId: 'pan' }),
    new ChannelDefinition({ name: 'Tilt', typeId: 'tilt' }),
    new ChannelDefinition({ name: 'Intensity', typeId: 'intensity' }),
    new ChannelDefinition({ name: 'Red', typeId: 'red' }),
    new ChannelDefinition({ name: 'Green', typeId: 'green' }),
    new ChannelDefinition({ name: 'Blue', typeId: 'blue' }),
    new ChannelDefinition({ name: 'White', typeId: 'white' }),
  ] })],
});
const par = new FixtureDefinition({
  manufacturer: 'Demo', model: 'RGB Par', type: 'PAR',
  modes: [new FixtureMode({ name: '4ch', channels: [
    new ChannelDefinition({ name: 'Intensity', typeId: 'intensity' }),
    new ChannelDefinition({ name: 'Red', typeId: 'red' }),
    new ChannelDefinition({ name: 'Green', typeId: 'green' }),
    new ChannelDefinition({ name: 'Blue', typeId: 'blue' }),
  ] })],
});

engine.universes.ensure(0, 'Test');
const mh = new Fixture({ id: 'mh1', name: 'Mover', definition: mover, universeId: 0, startAddress: 1 });
const pr = new Fixture({ id: 'par1', name: 'Par', definition: par, universeId: 0, startAddress: 21 });
show.patch.add(mh);
show.patch.add(pr);

// ---- drive to full, tick, read the raw (unlimited) frame ----------------
mh.set('intensity', 255); mh.setRGBW(255, 0, 80, 0); mh.setPanTilt(0x7fff, 0x7fff);
pr.set('intensity', 255); pr.setRGBW(0, 100, 255, 0);
show.patch.applyAll(engine.universes);

const read = (): number[] => Array.from(engine.universes.get(0)!.data);

engine.start();
await sleep(150);
const raw = read();

// ---- apply per-fixture limits, tick, read the limited frame -------------
mh.limits = { dimmer: { max: 100 }, tilt: { min: 0, max: 60 }, pan: { min: 0, max: 255, invert: true } };
rebuildFixtureMaps();
await sleep(150);
const limited = read();
engine.stop();

// ---- report -------------------------------------------------------------
interface Row { fixture: string; channel: string; addr: number; raw: number; limited: number; }
const rows: Row[] = [];
for (const fx of show.patch.list()) {
  fx.mode.channels.forEach((c, i) => {
    const addr = fx.startAddress + i;
    rows.push({ fixture: fx.name, channel: c?.name ?? '?', addr, raw: raw[addr - 1], limited: limited[addr - 1] });
  });
}

if (json) {
  console.log(JSON.stringify({ rows, limits: { mover: mh.limits } }, null, 2));
} else {
  console.log('\nMixed universe 0 — raw → limited (▸ = changed by a limit)\n');
  console.log('  addr  fixture  channel        raw  limited');
  for (const r of rows) {
    const mark = r.raw !== r.limited ? '▸' : ' ';
    console.log(
      `${mark} ${String(r.addr).padStart(4)}  ${r.fixture.padEnd(7)}  ${r.channel.padEnd(11)}  ` +
      `${String(r.raw).padStart(4)}  ${String(r.limited).padStart(5)}`,
    );
  }
  const changed = rows.filter((r) => r.raw !== r.limited);
  console.log(`\n${changed.length} channel(s) clamped/remapped by limits ` +
    `(dimmer cap 100, tilt max 60, pan invert).\n`);
}

process.exit(0);
