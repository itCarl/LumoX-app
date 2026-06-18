// 03 — sACN E1.31 multicast output. Two channels with different waveforms.
//
//   node examples/03-output-sacn.js

import { Engine, SacnOutput } from '../src/index';

const engine = new Engine();
const uni = engine.universes.ensure(0, 'sACN Demo');   // → sACN universe 1

const sacn = new SacnOutput({
  name: 'Stage',
  mode: 'multicast',           // → 239.255.0.1 (auto from universe)
  sourceName: 'Lumox Example',
  priority: 100,
  universeOffset: 1,           // engine id 0 → sACN universe 1
  subscribedUniverses: [0],
  // For unicast:  mode: 'unicast', host: '192.168.1.50'
});
engine.outputs.add(sacn);

await engine.outputs.openAll();
engine.start();

let t = 0;
setInterval(() => {
  t += 0.05;
  uni.setChannel(1, Math.round((Math.sin(t) * 0.5 + 0.5) * 255));
  uni.setChannel(2, Math.round((Math.cos(t) * 0.5 + 0.5) * 255));
}, 50);

process.on('SIGINT', async () => {
  engine.stop();
  await engine.outputs.closeAll();
  process.exit(0);
});
