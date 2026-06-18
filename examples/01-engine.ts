// 01 — Engine boot, universe creation, programmer write.
// No output attached. Prints universe.data on every tick.
//
//   node examples/01-engine.js

import { Engine } from '../src/index';

const engine = new Engine({ refreshHz: 5 });   // slow for readable logs
const uni = engine.universes.ensure(0, 'Demo');

uni.setChannel(1, 128);
uni.setChannel(2, 200);
uni.setChannel(3, 64);

engine.on('tick', () => {
  console.log('uni0 ch1..3 =', uni.getChannel(1), uni.getChannel(2), uni.getChannel(3));
});

engine.start();

process.on('SIGINT', () => { engine.stop(); process.exit(0); });
