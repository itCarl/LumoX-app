// 06 — Blackout toggles output zero every 2 s.
//
//   node examples/06-mix-blackout.js

import { Engine } from '../src/index';

const engine = new Engine({ refreshHz: 5 });
const uni = engine.universes.ensure(0, 'BO Demo');

uni.setChannel(1, 200);
uni.setChannel(2, 150);

setInterval(() => {
  engine.blackout!.toggle();
  console.log('Blackout', engine.blackout!.active ? 'ON' : 'OFF');
}, 2000);

engine.on('tick', () => {
  console.log('  ch1=', uni.getChannel(1), 'ch2=', uni.getChannel(2));
});

engine.start();
process.on('SIGINT', () => { engine.stop(); process.exit(0); });
