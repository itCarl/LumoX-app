import { MixModule, blendHTP, blendLTP } from '../MixModule.js';

/**
 * SceneMixer — blends a list of active "scene tracks" into the frame.
 *
 * Track shape:
 *   {
 *     id, sceneId,
 *     opacity: 0..1,            current blended weight
 *     blend: 'htp' | 'ltp',     default 'htp'
 *     values: { [universeId]: Uint8Array(512) },   pre-rendered scene data
 *     fadeIn, fadeOut, ...      (engine updates opacity over time)
 *   }
 *
 * The mixer itself is dumb — fade logic lives in a separate controller or
 * the scene system. Here we just consume opacity per tick.
 */
export class SceneMixer extends MixModule {
  constructor(config = {}) {
    super({ name: 'Scene Mixer', ...config });
    this.tracks = new Map(); // trackId → track
  }

  addTrack(track) {
    this.tracks.set(track.id, {
      blend: 'htp', opacity: 1, values: {}, ...track,
    });
  }

  removeTrack(id) { this.tracks.delete(id); }

  setOpacity(trackId, opacity) {
    const t = this.tracks.get(trackId);
    if (t) t.opacity = Math.max(0, Math.min(1, opacity));
  }

  clear() { this.tracks.clear(); }

  process(universe, _ctx) {
    for (const t of this.tracks.values()) {
      if (t.opacity <= 0) continue;
      const src = t.values[universe.id];
      if (!src) continue;
      if (t.blend === 'ltp') blendLTP(universe.data, src, t.opacity);
      else                   blendHTP(universe.data, src, t.opacity);
    }
  }
}
