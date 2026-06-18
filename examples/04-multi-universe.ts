// 04 — Three universes, different outputs per universe.
// Mimics the Lumox firmware setup: each ESP32 node owns one universe.
//
//   node examples/04-multi-universe.js

import { Engine, ArtNetOutput, SacnOutput } from '../src/index';

const engine = new Engine();
const u0 = engine.universes.ensure(0, 'Stage Left');
const u1 = engine.universes.ensure(1, 'Stage Right');
const u2 = engine.universes.ensure(2, 'Truss');

// Three Art-Net unicast targets — each subscribed to exactly one universe.
const nodes: Array<{ id: number; host: string; name: string }> = [
  { id: 0, host: '255.255.255.255', name: 'Node L' },
  { id: 1, host: '255.255.255.255', name: 'Node R' },
  { id: 2, host: '255.255.255.255', name: 'Node Truss' },
];
for (const n of nodes) {
  engine.outputs.add(new ArtNetOutput({
    name: n.name,
    host: n.host, broadcast: true,
    subscribedUniverses: [n.id],
    universeMap: { [n.id]: { net: 0, subnet: 0, universe: n.id } },
  }));
}

// Plus one sACN multicast covering everything (universes 1, 2, 3 on the wire)
engine.outputs.add(new SacnOutput({
  name: 'sACN All', mode: 'multicast',
  // no subscribedUniverses → all
}));

await engine.outputs.openAll();
engine.start();

let t = 0;
setInterval(() => {
  t += 0.02;
  u0.setChannel(1, Math.round((Math.sin(t       ) * 0.5 + 0.5) * 255));
  u1.setChannel(1, Math.round((Math.sin(t + 2.1) * 0.5 + 0.5) * 255));
  u2.setChannel(1, Math.round((Math.sin(t + 4.2) * 0.5 + 0.5) * 255));
}, 40);

process.on('SIGINT', async () => {
  engine.stop();
  await engine.outputs.closeAll();
  process.exit(0);
});
