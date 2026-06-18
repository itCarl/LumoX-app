// 07 — Two scenes crossfaded by opacity. HTP merge by default.
// Programmer holds a dim base; scenes ride on top.
//
//   node examples/07-mix-scenes.js

import { Engine } from '../src/index';

const engine = new Engine({ refreshHz: 10 });
const uni = engine.universes.ensure(0, 'Scenes');

// Programmer base — half-brightness across ch1..ch4
uni.setChannel(1, 64);
uni.setChannel(2, 64);
uni.setChannel(3, 64);
uni.setChannel(4, 64);

// Scene "red": ch1=255
const redValues = new Uint8Array(512); redValues[0] = 255;
engine.scenes!.addTrack({
  id: 'red', opacity: 0, blend: 'htp',
  values: { 0: redValues },
});

// Scene "blue": ch3=255
const blueValues = new Uint8Array(512); blueValues[2] = 255;
engine.scenes!.addTrack({
  id: 'blue', opacity: 0, blend: 'htp',
  values: { 0: blueValues },
});

// Crossfade: red 0→1 over 3 s, then blue 0→1 over 3 s, then both fade out.
let t = 0;
setInterval(() => {
  t += 0.1;
  const red  = Math.max(0, Math.min(1, Math.sin(t       ) * 0.5 + 0.5));
  const blue = Math.max(0, Math.min(1, Math.sin(t + 2.0) * 0.5 + 0.5));
  engine.scenes!.setOpacity('red',  red);
  engine.scenes!.setOpacity('blue', blue);
}, 100);

engine.on('tick', () => {
  console.log('ch1=', uni.getChannel(1), 'ch3=', uni.getChannel(3));
});

engine.start();
process.on('SIGINT', () => { engine.stop(); process.exit(0); });
