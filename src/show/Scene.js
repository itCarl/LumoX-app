import { DMX_CHANNELS } from '../core/Universe.js';

/**
 * Scene — snapshot of channel values across one or more universes, plus
 * fade timing metadata. Lives separately from the SceneMixer's runtime
 * tracks; convert with `scene.toMixerTrack()` before adding to the engine.
 *
 *   values:   { [universeId]: { [channel]: value } }   // sparse (1-based)
 *   fadeIn, fadeOut:  seconds
 */
export class Scene {
  constructor({ id, name, values = {}, fadeIn = 0, fadeOut = 0 } = {}) {
    this.id = id ?? `scene_${Math.random().toString(36).slice(2, 8)}`;
    this.name = name ?? this.id;
    this.values = values;
    this.fadeIn = fadeIn;
    this.fadeOut = fadeOut;
  }

  setValue(universeId, channel, value) {
    (this.values[universeId] ??= {})[channel] = value & 0xff;
  }

  /**
   * Capture current state of one or more universes (reads `programmer`
   * buffer by default — pass `from: 'data'` for post-mix output).
   *
   *   const s = Scene.snapshot({ id, name, universes: [u0, u1] });
   *
   * Optionally restrict to channels owned by a list of fixtures —
   * useful when you only want a colour scene, not whatever else is
   * patched on those universes.
   */
  static snapshot({ id, name, universes, from = 'programmer', fixtures = null }) {
    const sc = new Scene({ id, name });
    const allow = fixtures ? perUniverseAddrs(fixtures) : null;
    for (const u of universes) {
      const buf = from === 'data' ? u.data : u.programmer;
      const allowed = allow?.get(u.id);
      for (let i = 0; i < buf.length; i++) {
        if (allowed && !allowed.has(i + 1)) continue;
        if (buf[i] !== 0) sc.setValue(u.id, i + 1, buf[i]);
      }
    }
    return sc;
  }

  /**
   * Build a dense SceneMixer track from sparse values.
   *
   *   engine.scenes.addTrack(scene.toMixerTrack({ blend: 'ltp' }));
   */
  toMixerTrack({ blend = 'htp', opacity = 0 } = {}) {
    const dense = {};
    for (const [uniId, channels] of Object.entries(this.values)) {
      const buf = new Uint8Array(DMX_CHANNELS);
      for (const [ch, v] of Object.entries(channels)) buf[(+ch) - 1] = v & 0xff;
      dense[+uniId] = buf;
    }
    return { id: this.id, sceneId: this.id, opacity, blend, values: dense };
  }
}

function perUniverseAddrs(fixtures) {
  const map = new Map();
  for (const f of fixtures) {
    let s = map.get(f.universeId);
    if (!s) { s = new Set(); map.set(f.universeId, s); }
    for (let i = 0; i < f.channelCount; i++) s.add(f.startAddress + i);
  }
  return map;
}
