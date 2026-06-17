// 11 — RGBW moving head with 16-bit pan/tilt + intensity-only GrandMaster.
//
//   node examples/11-fixtures-rgbw-16bit.js

import {
  Engine, Patch, Fixture,
  FixtureDefinition, FixtureMode, ChannelDefinition,
} from '../src/index.js';

const mover = new FixtureDefinition({
  manufacturer: 'Demo', model: 'RGBW Mover 11ch', type: 'Moving Head',
  modes: [
    new FixtureMode({ name: '11ch', channels: [
      new ChannelDefinition({ name: 'Pan',       typeId: 'pan'       }),
      new ChannelDefinition({ name: 'Pan Fine',  typeId: 'pan-fine'  }),
      new ChannelDefinition({ name: 'Tilt',      typeId: 'tilt'      }),
      new ChannelDefinition({ name: 'Tilt Fine', typeId: 'tilt-fine' }),
      new ChannelDefinition({ name: 'Intensity', typeId: 'intensity' }),
      new ChannelDefinition({ name: 'Shutter',   typeId: 'shutter'   }),
      new ChannelDefinition({ name: 'Red',       typeId: 'red'       }),
      new ChannelDefinition({ name: 'Green',     typeId: 'green'     }),
      new ChannelDefinition({ name: 'Blue',      typeId: 'blue'      }),
      new ChannelDefinition({ name: 'White',     typeId: 'white'     }),
      new ChannelDefinition({ name: 'Speed',     typeId: 'speed'     }),
    ]}),
  ],
});

const engine = new Engine({ refreshHz: 10 });
engine.universes.ensure(0, 'Movers');

const patch = new Patch();
patch.add(new Fixture({ id: 'mh1', definition: mover, universeId: 0, startAddress: 1  }));
patch.add(new Fixture({ id: 'mh2', definition: mover, universeId: 0, startAddress: 12 }));

// Wire intensity-only mask into GrandMaster + Blackout — color stays untouched.
engine.grandMaster.mode = 'intensity-only';
engine.grandMaster.intensityChannels = patch.intensityChannels();
engine.blackout.mode = 'intensity-only';
engine.blackout.intensityChannels = patch.intensityChannels();

// Per-fixture setup
const mh1 = patch.get('mh1'), mh2 = patch.get('mh2');
mh1.set('intensity', 255); mh1.set('shutter', 255); mh1.setRGBW(255, 0, 80, 0);
mh2.set('intensity', 255); mh2.set('shutter', 255); mh2.setRGBW(0, 80, 255, 0);

// 16-bit pan/tilt sweep
let phase = 0;
setInterval(() => {
  phase += 0.05;
  const pan  = Math.round((Math.sin(phase       ) * 0.5 + 0.5) * 0xffff);
  const tilt = Math.round((Math.sin(phase * 1.3) * 0.5 + 0.5) * 0xffff);
  mh1.setPanTilt(pan, tilt);
  mh2.setPanTilt(0xffff - pan, tilt);
  patch.applyAll(engine.universes);
}, 50);

// GM sweep — only intensity channels (5 & 16) move
let gm = 1, dir = -1;
setInterval(() => {
  gm += dir * 0.05;
  if (gm <= 0) { gm = 0; dir =  1; }
  if (gm >= 1) { gm = 1; dir = -1; }
  engine.grandMaster.setValue(gm);
}, 200);

const u = engine.universes.get(0);
let n = 0;
engine.on('tick', () => {
  if (++n % 5 === 0) {
    console.log('GM=', engine.grandMaster.value.toFixed(2),
                ' mh1 pan=', (u.getChannel(1) << 8) | u.getChannel(2),
                ' int=', u.getChannel(5),
                ' R=', u.getChannel(7));
  }
});

engine.start();
process.on('SIGINT', () => { engine.stop(); process.exit(0); });
