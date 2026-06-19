// 27 — Art-Net node discovery. Broadcasts ArtPoll and lists the nodes that reply.
//
//   node examples/27-discovery.js
//
// Runs until Ctrl+C. Needs at least one Art-Net node on the same network (e.g. a
// Lumox ESP32, or the lumox-dmx-monitor sketch) to print anything.

import { DiscoveryService } from '../src/index';

const discovery = new DiscoveryService();

discovery.on('status', (s) => console.log(`[discovery] status: ${s}`));
discovery.on('changed', (devices) => {
  console.log(`\nDiscovered ${devices.length} node(s):`);
  for (const d of devices) {
    console.log(
      `  ${d.ip.padEnd(15)} U${String(d.universe).padEnd(3)} ` +
      `${(d.shortName || '—').padEnd(18)} v${d.firmware} ${d.mac}` +
      (d.isLumox ? ' [Lumox]' : ''),
    );
  }
});

await discovery.start();
console.log('Scanning for Art-Net nodes — Ctrl+C to stop.');

process.on('SIGINT', async () => {
  await discovery.stop();
  process.exit(0);
});
