// 09 — Custom MixModule. Implements a gamma curve applied to all channels.
// Insert it before GrandMaster so master scaling still works linearly.
//
//   node examples/09-mix-custom-module.js

import { Engine, MixModule } from '../src/index';
import type { Universe } from '../src/core/Universe';

class GammaCurve extends MixModule {
  gamma: number;
  _lut: Uint8Array;
  constructor(config: { gamma?: number; name?: string } = {}) {
    super({ name: 'Gamma Curve', ...config });
    this.gamma = config.gamma ?? 2.2;
    this._lut = buildLut(this.gamma);
  }
  setGamma(g: number) { this.gamma = g; this._lut = buildLut(g); }
  process(universe: Universe) {
    const d = universe.data;
    for (let i = 0; i < d.length; i++) d[i] = this._lut[d[i]];
  }
}

function buildLut(gamma: number): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(Math.pow(i / 255, gamma) * 255);
  return lut;
}

const engine = new Engine({ refreshHz: 10 });
const uni = engine.universes.ensure(0, 'Gamma Demo');

// Insert Gamma right before GrandMaster (index 3 in default pipeline).
const gamma = new GammaCurve({ gamma: 2.2 });
const gmIdx = engine.mix.list().findIndex((m) => m === engine.grandMaster);
engine.mix.insertAt(gmIdx, gamma);

// Linear ramp on programmer; output should curve due to gamma.
let v = 0;
setInterval(() => { v = (v + 5) & 0xff; uni.setChannel(1, v); }, 100);

engine.on('tick', () => {
  console.log('programmer=', uni.getProgrammerChannel(1), ' output=', uni.getChannel(1));
});

engine.start();
process.on('SIGINT', () => { engine.stop(); process.exit(0); });
