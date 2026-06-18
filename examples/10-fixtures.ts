// 10 — Define a fixture profile, patch instances, write via fixture API.
//
//   node examples/10-fixtures.js

import {
  Engine, Patch, Fixture,
  FixtureDefinition, FixtureMode, ChannelDefinition,
} from '../src/index';

const par = new FixtureDefinition({
  manufacturer: 'Demo', model: 'PAR-3', type: 'PAR',
  modes: [
    new FixtureMode({ name: '3ch', channels: [
      new ChannelDefinition({ name: 'Red',   typeId: 'red'   }),
      new ChannelDefinition({ name: 'Green', typeId: 'green' }),
      new ChannelDefinition({ name: 'Blue',  typeId: 'blue'  }),
    ]}),
  ],
});

const engine = new Engine({ refreshHz: 5 });
const uni = engine.universes.ensure(0, 'PARs');

const patch = new Patch();
patch.add(new Fixture({ id: 'par1', definition: par, universeId: 0, startAddress: 1 }));
patch.add(new Fixture({ id: 'par2', definition: par, universeId: 0, startAddress: 4 }));
patch.add(new Fixture({ id: 'par3', definition: par, universeId: 0, startAddress: 7 }));

// Write colors via the type-aware API
patch.get('par1')!.setRGB(255,   0,   0);
patch.get('par2')!.setRGB(  0, 255,   0);
patch.get('par3')!.setRGB(  0,   0, 255);

// Flush fixture state into the universe programmer
patch.applyAll(engine.universes);

engine.on('tick', () => {
  console.log('par1 RGB =', uni.getChannel(1), uni.getChannel(2), uni.getChannel(3),
              ' par2 RGB =', uni.getChannel(4), uni.getChannel(5), uni.getChannel(6),
              ' par3 RGB =', uni.getChannel(7), uni.getChannel(8), uni.getChannel(9));
});

engine.start();
process.on('SIGINT', () => { engine.stop(); process.exit(0); });
