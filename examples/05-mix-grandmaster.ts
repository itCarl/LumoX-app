// 05 — GrandMaster scales output 0..1.
// Programmer holds full intensity; GM sweeps and you see ch1 fade in/out.
//
//   node examples/05-mix-grandmaster.js

import { Engine } from '../src/index';

const engine = new Engine({ refreshHz: 10 });
const uni = engine.universes.ensure(0, 'GM Demo');

uni.setChannel(1, 255);
uni.setChannel(2, 255);

let gm = 1, dir = -1;
setInterval(() => {
  gm += dir * 0.05;
  if (gm <= 0) { gm = 0; dir =  1; }
  if (gm >= 1) { gm = 1; dir = -1; }
  engine.grandMaster!.setValue(gm);
}, 100);

engine.on('tick', () => {
  console.log('GM=', engine.grandMaster!.value.toFixed(2),
              'ch1=', uni.getChannel(1), 'ch2=', uni.getChannel(2));
});

engine.start();
process.on('SIGINT', () => { engine.stop(); process.exit(0); });
