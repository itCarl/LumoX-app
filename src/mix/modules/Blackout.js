import { MixModule } from '../MixModule.js';

/**
 * Blackout — zeroes output when active. Last stage in pipeline.
 *
 * Modes:
 *   'all'              zero all channels
 *   'intensity-only'   zero only channels in `intensityChannels` Map<universeId, Set<channel>>
 */
export class Blackout extends MixModule {
  constructor(config = {}) {
    super({ name: 'Blackout', ...config });
    this.active = config.active ?? false;
    this.mode = config.mode ?? 'all';
    this.intensityChannels = config.intensityChannels ?? new Map();
  }

  toggle() { this.active = !this.active; }
  set(active) { this.active = !!active; }

  process(universe, _ctx) {
    if (!this.active) return;
    if (this.mode === 'intensity-only') {
      const mask = this.intensityChannels.get(universe.id);
      if (mask) for (const ch of mask) universe.data[ch - 1] = 0;
      return;
    }
    universe.data.fill(0);
  }
}
