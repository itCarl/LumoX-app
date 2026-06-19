// Transport — the master tempo (BPM) for the show. Scenes whose driving mode is
// 'bpm' derive their cycle period from this clock (see SceneMixer.effectivePeriod).
// Single source of truth: the value is pushed into the engine's SceneMixer and
// persisted with the project (top-level `bpm`).

import { engine } from '../context';

const MIN_BPM = 20;
const MAX_BPM = 300;
const clampBpm = (n: number): number =>
  Number.isFinite(n) ? Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(n))) : 120;

class Transport {
  private bpm = 120;

  constructor() { engine.scenes.setBpm(this.bpm); }

  getBpm(): number { return this.bpm; }

  setBpm(bpm: number): number {
    this.bpm = clampBpm(bpm);
    engine.scenes.setBpm(this.bpm);
    return this.bpm;
  }

  /** Restore default tempo (project new). */
  reset(): void { this.setBpm(120); }
}

export const transport = new Transport();
