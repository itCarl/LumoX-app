// AudioBindingService — the engine side of audio-reactive input. It holds the
// audio bindings (a band/volume/beat SOURCE → a Lumox TARGET), receives live level
// frames from the renderer's shared audio engine (see renderer/lib/audio-engine.ts,
// pushed over `lumox:audio:levels`), and applies each binding every frame.
//
// Like the MIDI control surface (see MidiService), a level never knows what a scene
// is — it resolves to a Target and runs the SAME engine path the UI uses
// (`grandMaster`, group intensity, a raw channel write, `recallScene`, `blackout`),
// so audio behaves exactly like a fader or a button press.
//
// RANGE targets are driven continuously (band level → value); TRIGGER targets fire on
// a rising threshold crossing (or each beat). Bindings persist with the project. The
// service streams only while it holds ≥1 binding: it emits 'stream' so the renderer
// keeps the capture open and forwards frames even when the Connection tab is hidden.

import { EventEmitter } from 'node:events';
import { engine, show, recallScene, markLiveUniverse } from '../context';

export type AudioTargetKind = 'range' | 'trigger';
export type AudioCurve = 'linear' | 'exp' | 'log';

/** Where a binding reads its 0..1 level from. */
export interface AudioSource {
  type: 'band' | 'volume' | 'beat';
  index?: number;              // band index (0-based) when type === 'band'
}

/** What a Lumox control IS — a stable, persistable handle plus UI metadata. */
export interface AudioTarget {
  key: string;                 // "master", "blackout", "group:<id>:intensity", "scene:<id>", "dmx:<u>:<ch>"
  label: string;
  kind: AudioTargetKind;
  min?: number;                // natural range of the target (master 0..1, DMX 0..255)
  max?: number;
}

/** Per-binding behaviour, editable in the bindings table. */
export interface AudioBindingOptions {
  min?: number;                // output range override (else target.min)
  max?: number;
  invert?: boolean;            // range: flip the level
  curve?: AudioCurve;          // range: response shaping
  threshold?: number;          // trigger: 0..1 level that fires (ignored for beat source)
  mode?: 'flash' | 'toggle';   // trigger: hold-while-over vs flip-on-cross
}

export interface AudioBinding {
  id: string;
  source: AudioSource;
  target: AudioTarget;
  options: AudioBindingOptions;
}

export interface AudioLevels { bands: number[]; volume: number; beat: boolean; }

const newId = (): string => `ab_${Math.random().toString(36).slice(2, 9)}`;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Apply a response curve to a 0..1 level. */
function shape(curve: AudioCurve | undefined, v: number): number {
  if (curve === 'exp') return v * v;
  if (curve === 'log') return Math.sqrt(v);
  return v;
}

/**
 * Events (consumed by handlers/audio.ts → broadcast to windows):
 *   'bindings'  AudioBinding[]   (UI refresh)
 *   'stream'    boolean          (renderer should keep capturing + forwarding)
 * Binding CRUD arrives through wrapped IPC, so the handler registry flags the
 * project dirty + records undo — the service doesn't emit its own 'dirty'.
 */
export class AudioBindingService extends EventEmitter {
  private bindings: AudioBinding[] = [];
  private fired = new Map<string, boolean>();   // trigger rising-edge state per binding

  // ---- live application --------------------------------------------------
  /** Apply one level frame to every binding. Called on each `lumox:audio:levels`. */
  applyLevels(frame: AudioLevels): void {
    for (const b of this.bindings) {
      if (b.target.kind === 'range') this.applyRange(b, frame);
      else this.applyTrigger(b, frame);
    }
  }

  private level(source: AudioSource, frame: AudioLevels): number {
    if (source.type === 'volume') return clamp01(frame.volume);
    if (source.type === 'beat') return frame.beat ? 1 : 0;
    return clamp01(frame.bands[source.index ?? 0] ?? 0);
  }

  private applyRange(b: AudioBinding, frame: AudioLevels): void {
    let lvl = this.level(b.source, frame);
    if (b.options.invert) lvl = 1 - lvl;
    lvl = shape(b.options.curve, lvl);
    const min = b.options.min ?? b.target.min ?? 0;
    const max = b.options.max ?? b.target.max ?? 1;
    this.dispatchRange(b.target.key, min + lvl * (max - min));
  }

  private applyTrigger(b: AudioBinding, frame: AudioLevels): void {
    const over = b.source.type === 'beat'
      ? frame.beat
      : this.level(b.source, frame) >= (b.options.threshold ?? 0.5);
    const was = this.fired.get(b.id) ?? false;
    this.fired.set(b.id, over);
    if (b.options.mode === 'flash') {
      if (over && !was) this.dispatchTrigger(b.target.key, true);
      else if (!over && was) this.dispatchTrigger(b.target.key, false);
    } else if (over && !was) {
      this.dispatchToggle(b.target.key);
    }
  }

  // ---- executor dispatch (same engine paths the UI uses) -----------------
  private dispatchRange(key: string, out: number): void {
    if (key === 'master') { engine.grandMaster.setValue(clamp01(out)); return; }
    if (key.startsWith('group:') && key.endsWith(':intensity')) {
      const gid = key.slice('group:'.length, key.length - ':intensity'.length);
      const g = show.groups.get(gid);
      if (!g) return;
      g.setIntensity(show.patch, Math.round(out));
      g.apply(show.patch, engine.universes);
      for (const fx of g.fixtures(show.patch)) markLiveUniverse(fx.universeId);
      return;
    }
    if (key.startsWith('dmx:')) {
      const [u, ch] = key.slice('dmx:'.length).split(':').map(Number);
      const uni = engine.universes.get(u);
      if (!uni) return;
      uni.setChannel(ch, Math.round(clamp01(out / 255) * 255));
      markLiveUniverse(u);
    }
  }

  private dispatchTrigger(key: string, on: boolean): void {
    if (key.startsWith('scene:')) recallScene(key.slice('scene:'.length), on);
    else if (key === 'blackout') engine.blackout.set(on);
  }

  private dispatchToggle(key: string): void {
    if (key.startsWith('scene:')) { const id = key.slice('scene:'.length); recallScene(id, !engine.scenes.isLive(id)); }
    else if (key === 'blackout') engine.blackout.toggle();
  }

  // ---- binding CRUD ------------------------------------------------------
  addBinding(source: AudioSource, target: AudioTarget): AudioBinding | null {
    if (!target?.key || !this.targetResolves(target.key)) return null;
    const b: AudioBinding = {
      id: newId(),
      source: { type: source.type, index: source.index },
      target: { ...target },
      options: target.kind === 'trigger' ? { mode: 'flash', threshold: 0.5 } : { curve: 'linear' },
    };
    this.bindings.push(b);
    this.afterChange();
    return b;
  }

  /** Re-point a binding's source and/or target in place (editable table). Switching
   *  target kind resets options to that kind's sensible defaults. */
  setBinding(id: string, patch: { source?: AudioSource; target?: AudioTarget }): void {
    const b = this.bindings.find((x) => x.id === id);
    if (!b) return;
    if (patch.source) b.source = { type: patch.source.type, index: patch.source.index };
    if (patch.target && this.targetResolves(patch.target.key)) {
      const kindChanged = patch.target.kind !== b.target.kind;
      b.target = { ...patch.target };
      if (kindChanged) b.options = patch.target.kind === 'trigger' ? { mode: 'flash', threshold: 0.5 } : { curve: 'linear' };
    }
    this.fired.delete(id);
    this.emitBindings();
  }

  setBindingOptions(id: string, options: AudioBindingOptions): void {
    const b = this.bindings.find((x) => x.id === id);
    if (!b) return;
    b.options = { ...b.options, ...options };
    this.emitBindings();
  }

  removeBinding(id: string): void {
    const before = this.bindings.length;
    this.bindings = this.bindings.filter((b) => b.id !== id);
    this.fired.delete(id);
    if (this.bindings.length !== before) this.afterChange();
  }

  // ---- target catalog (offered in the bindings UI) -----------------------
  /** Resolvable targets for the current show. Raw DMX channels are built client-side. */
  targets(): AudioTarget[] {
    const list: AudioTarget[] = [
      { key: 'master', label: 'Grand master', kind: 'range', min: 0, max: 1 },
      { key: 'blackout', label: 'Blackout', kind: 'trigger' },
    ];
    for (const g of show.groups.list()) {
      list.push({ key: `group:${g.id}:intensity`, label: `Group · ${g.name}`, kind: 'range', min: 0, max: 255 });
    }
    for (const s of show.listScenes()) {
      list.push({ key: `scene:${s.id}`, label: `Scene · ${s.name}`, kind: 'trigger' });
    }
    return list;
  }

  // ---- persistence (project file) ----------------------------------------
  listBindings(): AudioBinding[] {
    return this.bindings.map((b) => ({ ...b, source: { ...b.source }, target: { ...b.target }, options: { ...b.options } }));
  }

  /** Restore from a project, dropping any whose target no longer resolves. */
  loadBindings(arr: unknown): void {
    const list = Array.isArray(arr) ? arr : [];
    this.bindings = list
      .filter((b): b is AudioBinding => this.isBinding(b) && this.targetResolves(b.target.key))
      .map((b) => ({
        id: b.id || newId(),
        source: { type: b.source.type, index: b.source.index },
        target: { key: b.target.key, label: b.target.label, kind: b.target.kind, min: b.target.min, max: b.target.max },
        options: b.options ?? {},
      }));
    this.fired.clear();
    this.emitBindings();
    this.emit('stream', this.bindings.length > 0);
  }

  private afterChange(): void {
    this.emitBindings();
    this.emit('stream', this.bindings.length > 0);
  }

  private emitBindings(): void { this.emit('bindings', this.listBindings()); }

  private isBinding(b: any): b is AudioBinding {
    return !!b && b.source && (b.source.type === 'band' || b.source.type === 'volume' || b.source.type === 'beat')
      && b.target && typeof b.target.key === 'string'
      && (b.target.kind === 'range' || b.target.kind === 'trigger');
  }

  private targetResolves(key: string): boolean {
    if (key === 'master' || key === 'blackout') return true;
    if (key.startsWith('scene:')) return !!show.scenes.get(key.slice('scene:'.length));
    if (key.startsWith('group:') && key.endsWith(':intensity')) {
      return !!show.groups.get(key.slice('group:'.length, key.length - ':intensity'.length));
    }
    if (key.startsWith('dmx:')) {
      const [u, ch] = key.slice('dmx:'.length).split(':').map(Number);
      return Number.isInteger(u) && Number.isInteger(ch) && ch >= 1 && ch <= 512 && !!engine.universes.get(u);
    }
    return false;
  }
}

// Single instance for the whole app.
export const audioBindings = new AudioBindingService();
export const listAudioBindings = (): AudioBinding[] => audioBindings.listBindings();
export const loadAudioBindings = (arr: unknown): void => audioBindings.loadBindings(arr);
