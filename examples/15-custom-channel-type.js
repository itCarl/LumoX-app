// 15 — Register a new ChannelType. Once registered, ChannelDefinition can
// reference it by id from anywhere (including importers).
//
//   node examples/15-custom-channel-type.js

import {
  ChannelType, ChannelTypeRegistry,
  ChannelDefinition, FixtureMode, FixtureDefinition, Fixture,
  Engine,
} from '../src/index.js';

// Register two new types
ChannelTypeRegistry.register(new ChannelType({
  id: 'laser-safety', name: 'Laser Safety', group: 'maintenance',
}));
ChannelTypeRegistry.register(new ChannelType({
  id: 'laser-pattern', name: 'Laser Pattern', group: 'effect',
}));

console.log('All types in "maintenance":',
  ChannelTypeRegistry.byGroup('maintenance').map((t) => t.id));

// Build a profile that uses them
const laser = new FixtureDefinition({
  manufacturer: 'Demo', model: 'Laser 3W', type: 'Laser',
  modes: [new FixtureMode({ name: '4ch', channels: [
    new ChannelDefinition({ typeId: 'laser-safety',  name: 'Safety'  }),
    new ChannelDefinition({ typeId: 'intensity',     name: 'Power'   }),
    new ChannelDefinition({ typeId: 'laser-pattern', name: 'Pattern' }),
    new ChannelDefinition({ typeId: 'speed',         name: 'Speed'   }),
  ]})],
});

const engine = new Engine({ refreshHz: 5 });
const uni = engine.universes.ensure(0, 'Laser');
const fx = new Fixture({ definition: laser, universeId: 0, startAddress: 1 });
fx.set('laser-safety', 200);
fx.set('intensity', 128);
fx.set('laser-pattern', 64);
fx.apply(uni);

engine.on('tick', () => {
  console.log('ch1..4 =',
    uni.getChannel(1), uni.getChannel(2), uni.getChannel(3), uni.getChannel(4));
});

engine.start();
process.on('SIGINT', () => { engine.stop(); process.exit(0); });
