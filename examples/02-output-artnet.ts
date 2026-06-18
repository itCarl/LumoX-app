// 02 — Art-Net broadcast output. Slow ramp on ch1.
//
//   node examples/02-output-artnet.js

import { Engine, ArtNetOutput } from '../src/index';

const engine = new Engine();
const uni = engine.universes.ensure(0, 'Art-Net Demo');

const artnet = new ArtNetOutput({
  name: 'Broadcast',
  host: '255.255.255.255',
  broadcast: true,
  subscribedUniverses: [0],
  // For unicast to a specific node:
  //   host: '192.168.4.21', broadcast: false
  // Map engine universe id to ArtNet net/subnet/universe:
  //   universeMap: { 0: { net: 0, subnet: 0, universe: 0 } }
});
engine.outputs.add(artnet);

await engine.outputs.openAll();
engine.start();

let v = 0;
setInterval(() => {
  v = (v + 1) & 0xff;
  uni.setChannel(1, v);
}, 50);

process.on('SIGINT', async () => {
  engine.stop();
  await engine.outputs.closeAll();
  process.exit(0);
});
