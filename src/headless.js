// Smoke test — runs engine + mix + fixtures without Electron.
// Demonstrates: fixture profile, mode pick, patch, programmer write, scene,
// effect, grand master sweep, intensity-only mask wiring.
//
//   npm run headless

import {
  Engine, ArtNetOutput, SacnOutput, setLogLevel, sineEffect,
  FixtureDefinition, FixtureMode, ChannelDefinition, Fixture, Patch,
} from './index.js';

setLogLevel('debug');

// ---- profile: 7-channel RGBW moving head --------------------------------
const movingHead = new FixtureDefinition({
  manufacturer: 'Demo', model: 'RGBW Mover', type: 'Moving Head',
  modes: [
    new FixtureMode({
      name: '7ch', channels: [
        new ChannelDefinition({ name: 'Pan',       typeId: 'pan'       }),
        new ChannelDefinition({ name: 'Tilt',      typeId: 'tilt'      }),
        new ChannelDefinition({ name: 'Intensity', typeId: 'intensity' }),
        new ChannelDefinition({ name: 'Red',       typeId: 'red'       }),
        new ChannelDefinition({ name: 'Green',     typeId: 'green'     }),
        new ChannelDefinition({ name: 'Blue',      typeId: 'blue'      }),
        new ChannelDefinition({ name: 'White',     typeId: 'white'     }),
      ],
    }),
  ],
});

// ---- engine + patch -----------------------------------------------------
const engine = new Engine({ refreshHz: 44 });
engine.universes.ensure(0, 'Test');

const patch = new Patch();
patch.add(new Fixture({ id: 'mh1', definition: movingHead, universeId: 0, startAddress: 1 }));
patch.add(new Fixture({ id: 'mh2', definition: movingHead, universeId: 0, startAddress: 11 }));

// Wire intensity mask so GrandMaster scales only intensity channels.
engine.grandMaster.mode = 'intensity-only';
engine.grandMaster.intensityChannels = patch.intensityChannels();
engine.blackout.mode = 'intensity-only';
engine.blackout.intensityChannels = patch.intensityChannels();

// ---- programmer writes via Fixture API ----------------------------------
const mh1 = patch.get('mh1');
const mh2 = patch.get('mh2');
mh1.set('intensity', 255);
mh1.setRGBW(255, 0, 80, 0);
mh1.setPanTilt(0x7fff, 0x7fff);
mh2.set('intensity', 255);
mh2.setRGBW(0, 100, 255, 0);

// Flush fixture state into universe programmer buffer
patch.applyAll(engine.universes);

// ---- effect on universe 0 ch1 (Pan) ------------------------------------
engine.effects.add(sineEffect({
  id: 'panSweep', channel: mh1.addressOf('pan'),
  periodMs: 4000, universeIds: [0],
}));

// ---- grand master sweep ------------------------------------------------
let gm = 1, dir = -1;
setInterval(() => {
  gm += dir * 0.02;
  if (gm <= 0) { gm = 0; dir =  1; }
  if (gm >= 1) { gm = 1; dir = -1; }
  engine.grandMaster.setValue(gm);
}, 100);

// ---- outputs ------------------------------------------------------------
engine.outputs.add(new ArtNetOutput({
  name: 'Art-Net broadcast', host: '255.255.255.255', broadcast: true,
  subscribedUniverses: [0],
}));
engine.outputs.add(new SacnOutput({
  name: 'sACN multicast', mode: 'multicast', sourceName: 'Lumox Headless',
  subscribedUniverses: [0],
}));

await engine.outputs.openAll();
engine.start();

process.on('SIGINT', async () => {
  engine.stop();
  await engine.outputs.closeAll();
  process.exit(0);
});
