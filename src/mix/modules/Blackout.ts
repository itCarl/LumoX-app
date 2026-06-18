import { MixModule } from '../MixModule';
import type { MixModuleConfig, MixContext } from '../MixModule';
import type { Universe } from '../../core/Universe';

export type IntensityChannels = Map<number, Set<number>>;

export interface BlackoutConfig extends MixModuleConfig {
  active?: boolean;
  mode?: 'all' | 'intensity-only';
  intensityChannels?: IntensityChannels;
}

/**
 * Blackout — zeroes output when active. Last stage in pipeline.
 *
 * Modes:
 *   'all'              zero all channels
 *   'intensity-only'   zero only channels in `intensityChannels` Map<universeId, Set<channel>>
 */
export class Blackout extends MixModule {
  active: boolean;
  mode: 'all' | 'intensity-only';
  intensityChannels: IntensityChannels;

  constructor(config: BlackoutConfig = {}) {
    super({ name: 'Blackout', ...config });
    this.active = config.active ?? false;
    this.mode = config.mode ?? 'all';
    this.intensityChannels = config.intensityChannels ?? new Map();
  }

  toggle(): void { this.active = !this.active; }
  set(active: boolean): void { this.active = !!active; }

  process(universe: Universe, _ctx: MixContext): void {
    if (!this.active) return;
    if (this.mode === 'intensity-only') {
      const mask = this.intensityChannels.get(universe.id);
      if (mask) for (const ch of mask) universe.data[ch - 1] = 0;
      return;
    }
    universe.data.fill(0);
  }
}
