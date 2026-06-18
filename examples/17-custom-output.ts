// 17 — Custom Output: console printer. Prints active channels each tick.
// Demonstrates the Output plugin contract without touching a network.
//
//   node examples/17-custom-output.js

import { Engine, Output, OutputManager } from '../src/index';
import type { Universe } from '../src/core/Universe';

class ConsoleOutput extends Output {
  static TYPE = 'console';
  maxChannels: number;

  constructor(config: { maxChannels?: number; name?: string; keepAliveMs?: number } = {}) {
    super({ name: 'Console', keepAliveMs: 1000, ...config });
    this.maxChannels = config.maxChannels ?? 8;
  }
  async _openImpl()  { /* nothing to open */ }
  async _closeImpl() { /* nothing to close */ }
  _sendImpl(universe: Universe, data: Uint8Array) {
    const slice = Array.from(data.slice(0, this.maxChannels))
      .map((v) => v.toString(10).padStart(3, ' '));
    console.log(`uni${universe.id}:`, slice.join(' '));
  }
}
OutputManager.registerType(ConsoleOutput);

const engine = new Engine({ refreshHz: 5 });
const uni = engine.universes.ensure(0, 'Console Demo');

// Use the factory now that the type is registered
const out = engine.outputs.create('console', { maxChannels: 6 });
await out.open();

engine.start();

let v = 0;
setInterval(() => {
  v = (v + 10) & 0xff;
  uni.setChannel(1, v);
  uni.setChannel(3, 255 - v);
}, 200);

process.on('SIGINT', async () => {
  engine.stop();
  await engine.outputs.closeAll();
  process.exit(0);
});
