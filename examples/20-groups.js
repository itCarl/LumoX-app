// 20 — Group fixtures, apply batch operations.
// No effects — direct setRGB / setIntensity on whole groups.
//
//   node examples/20-groups.js

import {
  Engine, Patch, Fixture, Group, GroupManager,
  FixtureDefinition, FixtureMode, ChannelDefinition,
} from '../src/index.js';

// 4-channel RGBW PAR profile
const par = new FixtureDefinition({
  manufacturer: 'Demo', model: 'PAR RGBW', type: 'PAR',
  modes: [new FixtureMode({ name: '4ch', channels: [
    new ChannelDefinition({ typeId: 'red'   }),
    new ChannelDefinition({ typeId: 'green' }),
    new ChannelDefinition({ typeId: 'blue'  }),
    new ChannelDefinition({ typeId: 'white' }),
  ]})],
});

const engine = new Engine({ refreshHz: 5 });
const uni = engine.universes.ensure(0, 'PARs');

// 6 PARs patched ch1, ch5, ch9, ch13, ch17, ch21
const patch = new Patch();
for (let i = 0; i < 6; i++) {
  patch.add(new Fixture({
    id: `par${i + 1}`, definition: par, universeId: 0,
    startAddress: 1 + i * 4,
  }));
}

// Two groups: left half / right half
const groups = new GroupManager();
const left  = groups.add(new Group({ id: 'left',  name: 'Stage Left',  color: '#ff5050' }));
const right = groups.add(new Group({ id: 'right', name: 'Stage Right', color: '#5050ff' }));
['par1', 'par2', 'par3'].forEach((id) => left.add(id));
['par4', 'par5', 'par6'].forEach((id) => right.add(id));

// Batch ops — whole group at once
left.setRGB(patch, 255, 60, 0);    // warm orange
right.setRGB(patch, 0, 80, 255);   // cool blue
patch.applyAll(engine.universes);

console.log('Groups:', groups.list().map((g) => `${g.name} (${g.size} fixtures)`));
console.log('Fixtures in "right":', right.list());

engine.on('tick', () => {
  const row = [];
  for (let i = 1; i <= 24; i++) row.push(uni.getChannel(i).toString(10).padStart(3));
  console.log(row.join(' '));
});

engine.start();

// Cycle group colors every 2 s to show batch update
let toggle = 0;
setInterval(() => {
  toggle = (toggle + 1) % 4;
  switch (toggle) {
    case 0: left.setRGB(patch, 255, 0, 0);   right.setRGB(patch, 0, 0, 255);   break;
    case 1: left.setRGB(patch, 0, 255, 0);   right.setRGB(patch, 255, 0, 255); break;
    case 2: left.setRGB(patch, 0, 0, 255);   right.setRGB(patch, 0, 255, 0);   break;
    case 3: left.setRGB(patch, 255, 255, 0); right.setRGB(patch, 0, 255, 255); break;
  }
  patch.applyAll(engine.universes);
}, 2000);

process.on('SIGINT', () => { engine.stop(); process.exit(0); });
