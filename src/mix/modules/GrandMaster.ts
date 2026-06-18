import { MixModule, scaleAll, scaleMasked } from '../MixModule';
import type { MixModuleConfig, MixContext } from '../MixModule';
import type { Universe } from '../../core/Universe';

export type IntensityChannels = Map<number, Set<number>>;

export interface GrandMasterConfig extends MixModuleConfig {
  value?: number;
  mode?: 'all' | 'intensity-only';
  intensityChannels?: IntensityChannels;
}

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
  value: number;
  mode: 'all' | 'intensity-only';
  intensityChannels: IntensityChannels;

  constructor(config: GrandMasterConfig = {}) {
    super({ name: 'Grand Master', ...config });
    this.value = config.value ?? 1;
    this.mode = config.mode ?? 'all';
    this.intensityChannels = config.intensityChannels ?? new Map();
  }

  setValue(v: number): void { this.value = Math.max(0, Math.min(1, v)); }

  process(universe: Universe, _ctx: MixContext): void {
    if (this.value >= 1) return;
    if (this.mode === 'intensity-only') {
      const mask = this.intensityChannels.get(universe.id);
      if (mask && mask.size) scaleMasked(universe.data, this.value, mask);
      return;
    }
    scaleAll(universe.data, this.value);
  }
}
