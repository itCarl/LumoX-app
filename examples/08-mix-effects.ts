// 08 — Built-in effects: sine, strobe, chase.
// Each runs at full opacity and HTP-blends into the frame.
//
//   node examples/08-mix-effects.js

import { Engine, sineEffect, strobeEffect, chaseEffect } from '../src/index';

const engine = new Engine({ refreshHz: 30 });
const uni = engine.universes.ensure(0, 'FX');

engine.effects!.add(sineEffect({
  id: 'sine1', channel: 1, periodMs: 2000, min: 0, max: 255,
  universeIds: [0],
}));

engine.effects!.add(strobeEffect({
  id: 'strobe1', channels: [2], rateHz: 8, universeIds: [0],
}));

engine.effects!.add(chaseEffect({
  id: 'chase1',
  steps: [[3], [4], [5], [4]],   // walk ch3 → ch5 → back
  stepMs: 200,
  universeIds: [0],
}));

let n = 0;
engine.on('tick', () => {
  if (++n % 10 === 0) {
    console.log('ch1..5 =',
      uni.getChannel(1), uni.getChannel(2), uni.getChannel(3),
      uni.getChannel(4), uni.getChannel(5));
  }
});

engine.start();
process.on('SIGINT', () => { engine.stop(); process.exit(0); });
