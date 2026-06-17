// 21 — Fixture-aware effects targeting a Group.
// Rainbow across all PARs, chase across moving heads, sine intensity on bar.
//
//   node examples/21-group-effects.js

import {
  Engine, Patch, Fixture, Group,
  FixtureDefinition, FixtureMode, ChannelDefinition,
  rainbowGroupEffect, chaseGroupEffect, sineIntensityGroupEffect,
} from '../src/index.js';

// ---- profiles ---------------------------------------------------------
const par = new FixtureDefinition({
  manufacturer: 'Demo', model: 'PAR RGBW', type: 'PAR',
  modes: [new FixtureMode({ name: '5ch', channels: [
    new ChannelDefinition({ typeId: 'intensity' }),
    new ChannelDefinition({ typeId: 'red' }),
    new ChannelDefinition({ typeId: 'green' }),
    new ChannelDefinition({ typeId: 'blue' }),
    new ChannelDefinition({ typeId: 'white' }),
  ]})],
});

const mover = new FixtureDefinition({
  manufacturer: 'Demo', model: 'Mini Mover', type: 'Moving Head',
  modes: [new FixtureMode({ name: '6ch', channels: [
    new ChannelDefinition({ typeId: 'pan' }),
    new ChannelDefinition({ typeId: 'tilt' }),
    new ChannelDefinition({ typeId: 'intensity' }),
    new ChannelDefinition({ typeId: 'red' }),
    new ChannelDefinition({ typeId: 'green' }),
    new ChannelDefinition({ typeId: 'blue' }),
  ]})],
});

// ---- engine + patch ---------------------------------------------------
const engine = new Engine({ refreshHz: 30 });
const uni = engine.universes.ensure(0, 'Stage');

const patch = new Patch();
// 6 PARs at ch1, ch6, ch11, ch16, ch21, ch26
for (let i = 0; i < 6; i++) {
  patch.add(new Fixture({
    id: `par${i + 1}`, definition: par,
    universeId: 0, startAddress: 1 + i * 5,
  }));
}
// 4 movers at ch31, ch37, ch43, ch49
for (let i = 0; i < 4; i++) {
  patch.add(new Fixture({
    id: `mh${i + 1}`, definition: mover,
    universeId: 0, startAddress: 31 + i * 6,
  }));
}

// ---- groups -----------------------------------------------------------
const pars = new Group({ id: 'pars', name: 'PARs', color: '#ffaa00' });
['par1', 'par2', 'par3', 'par4', 'par5', 'par6'].forEach((id) => pars.add(id));

const movers = new Group({ id: 'movers', name: 'Movers', color: '#00aaff' });
['mh1', 'mh2', 'mh3', 'mh4'].forEach((id) => movers.add(id));

// ---- wire GroupEffects with patch -------------------------------------
engine.groupEffects.bindPatch(patch);

// Rainbow across PAR group — hue spread across all 6 fixtures
engine.groupEffects.add(rainbowGroupEffect({
  id: 'rb', group: pars, periodMs: 4000, spread: 1.0,
}));

// Chase across mover group — one mover lit at a time
engine.groupEffects.add(chaseGroupEffect({
  id: 'ch', group: movers, stepMs: 400, color: [255, 80, 200],
}));

// Optional sine-intensity layer over movers (will HTP-merge with chase)
engine.groupEffects.add(sineIntensityGroupEffect({
  id: 'sine-mh', group: movers, periodMs: 3000, phaseSpread: 1, opacity: 0.5,
}));

engine.start();

// Print state every second
let n = 0;
engine.on('tick', () => {
  if (++n % 30 !== 0) return;
  console.log(
    'PAR1 RGB =', uni.getChannel(2), uni.getChannel(3), uni.getChannel(4),
    ' PAR6 RGB =', uni.getChannel(22), uni.getChannel(23), uni.getChannel(24),
    ' MH1 int=', uni.getChannel(33), ' MH3 int=', uni.getChannel(45));
});

process.on('SIGINT', () => { engine.stop(); process.exit(0); });
