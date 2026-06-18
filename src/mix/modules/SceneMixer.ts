import { MixModule, blendHTP, blendLTP } from '../MixModule';
import type { MixModuleConfig, MixContext } from '../MixModule';
import type { Universe } from '../../core/Universe';

export type BlendMode = 'htp' | 'ltp';

/**
 * A single scene track consumed by the SceneMixer.
 */
export interface SceneTrack {
  id: string;
  sceneId?: string;
  /** current blended weight, 0..1 */
  opacity: number;
  /** default 'htp' */
  blend: BlendMode;
  /** pre-rendered scene data keyed by universe id */
  values: { [universeId: number]: Uint8Array };
  // fadeIn, fadeOut, ... (engine updates opacity over time)
  [key: string]: unknown;
}

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
  tracks: Map<string, SceneTrack>;

  constructor(config: MixModuleConfig = {}) {
    super({ name: 'Scene Mixer', ...config });
    this.tracks = new Map(); // trackId → track
  }

  addTrack(track: Partial<SceneTrack> & { id: string }): void {
    this.tracks.set(track.id, {
      blend: 'htp', opacity: 1, values: {}, ...track,
    } as SceneTrack);
  }

  removeTrack(id: string): void { this.tracks.delete(id); }

  setOpacity(trackId: string, opacity: number): void {
    const t = this.tracks.get(trackId);
    if (t) t.opacity = Math.max(0, Math.min(1, opacity));
  }

  clear(): void { this.tracks.clear(); }

  process(universe: Universe, _ctx: MixContext): void {
    for (const t of this.tracks.values()) {
      if (t.opacity <= 0) continue;
      const src = t.values[universe.id];
      if (!src) continue;
      if (t.blend === 'ltp') blendLTP(universe.data, src, t.opacity);
      else                   blendHTP(universe.data, src, t.opacity);
    }
  }
}
