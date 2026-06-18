// 12 — FixtureLibrary: add definitions, search, list manufacturers.
// Prints results and exits.
//
//   node examples/12-fixture-library.js

import {
  FixtureLibrary, FixtureDefinition, FixtureMode, ChannelDefinition,
} from '../src/index';

const lib = new FixtureLibrary();

const par3 = new FixtureDefinition({
  manufacturer: 'Demo', model: 'PAR-3', type: 'PAR',
  modes: [new FixtureMode({ name: '3ch', channels: [
    new ChannelDefinition({ name: 'R', typeId: 'red' }),
    new ChannelDefinition({ name: 'G', typeId: 'green' }),
    new ChannelDefinition({ name: 'B', typeId: 'blue' }),
  ]})],
});

const par4 = new FixtureDefinition({
  manufacturer: 'Demo', model: 'PAR-4', type: 'PAR',
  modes: [new FixtureMode({ name: '4ch', channels: [
    new ChannelDefinition({ name: 'R', typeId: 'red' }),
    new ChannelDefinition({ name: 'G', typeId: 'green' }),
    new ChannelDefinition({ name: 'B', typeId: 'blue' }),
    new ChannelDefinition({ name: 'W', typeId: 'white' }),
  ]})],
});

const beam = new FixtureDefinition({
  manufacturer: 'Acme', model: 'Beam 230', type: 'Moving Head',
  modes: [new FixtureMode({ name: '16ch', channels: [
    new ChannelDefinition({ typeId: 'pan' }), new ChannelDefinition({ typeId: 'pan-fine' }),
    new ChannelDefinition({ typeId: 'tilt' }), new ChannelDefinition({ typeId: 'tilt-fine' }),
    new ChannelDefinition({ typeId: 'intensity' }),
  ]})],
});

lib.add(par3, 'builtin');
lib.add(par4, 'builtin');
lib.add(beam, 'user');

console.log('All:', lib.list().map((d) => d.id));
console.log('Manufacturers:', lib.manufacturers());
console.log('PARs:',  lib.find({ type: 'PAR'  }).map((d) => d.id));
console.log('Acme:',  lib.find({ manufacturer: 'Acme' }).map((d) => d.id));
console.log('Search "par":', lib.find({ query: 'par' }).map((d) => d.id));
