import { MixModule, scaleAll, scaleMasked } from '../MixModule.js';

/**
 * GrandMaster — final intensity scaling.
 *
 * Modes:
 *   'all'              scales every channel (default skeleton behaviour)
 *   'intensity-only'   scales only channels listed in `intensityChannels`
 *                      (Map<universeId, Set<channel>>) — set this once
 *                      fixture patch is wired in.
 *
 * `value` is 0..1.
 */
export class GrandMaster extends MixModule {
  constructor(config = {}) {
    super({ name: 'Grand Master', ...config });
    this.value = config.value ?? 1;
    this.mode = config.mode ?? 'all';
    this.intensityChannels = config.intensityChannels ?? new Map();
  }

  setValue(v) { this.value = Math.max(0, Math.min(1, v)); }

  process(universe, _ctx) {
    if (this.value >= 1) return;
    if (this.mode === 'intensity-only') {
      const mask = this.intensityChannels.get(universe.id);
      if (mask && mask.size) scaleMasked(universe.data, this.value, mask);
      return;
    }
    scaleAll(universe.data, this.value);
  }
}
