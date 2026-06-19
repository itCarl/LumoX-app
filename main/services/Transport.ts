// Transport — the master tempo (BPM) for the show and where it comes from. Scenes
// whose driving mode is 'bpm' derive their cycle period from this clock (see
// SceneMixer.effectivePeriod). The tempo can be driven by one of several sources
// (TempoSource): 'manual' (typed / scrubbed / tapped), an external 'midi' clock,
// 'audio' onset detection (estimated in the renderer and pushed in), or an Ableton
// 'link' session. The BPM value is pushed into the engine's SceneMixer and
// persisted with the project (top-level `bpm`); the chosen source + MIDI device are
// machine-scoped settings (SettingsService), restored at boot via `init()`.

import { EventEmitter } from 'node:events';
import { engine } from '../context';
import { midiManager } from './midi-backend';
import { getSettings } from './SettingsService';
import type { TempoSource, TransportStatus } from '../dto';
import { MidiClockSource } from './tempo/MidiClockSource';
import { LinkSource } from './tempo/LinkSource';

const MIN_BPM = 20;
const MAX_BPM = 300;
const clampBpm = (n: number): number =>
  Number.isFinite(n) ? Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(n))) : 120;

class Transport extends EventEmitter {
  private bpm = 120;
  private source: TempoSource = 'manual';
  private midiInput: string | null = null;
  private linkAvailable = false;

  // The app's single shared MIDI backend (see midi-backend.ts) — used by the
  // device picker (listInputs) and the clock source, and shared with the control
  // surface so there is exactly one MIDI backend / one clock across the app.
  private readonly midi = midiManager;
  private midiClock: MidiClockSource | null = null;
  private link: LinkSource | null = null;

  constructor() { super(); engine.scenes.setBpm(this.bpm); }

  /** Adopt the persisted source after settings have loaded (call once at boot). */
  async init(): Promise<void> {
    this.linkAvailable = await LinkSource.available();
    const s = getSettings();
    await this.setSource(s.tempoSource, s.midiClockInput);
  }

  getBpm(): number { return this.bpm; }
  getSource(): TempoSource { return this.source; }

  status(): TransportStatus {
    return {
      bpm: this.bpm,
      source: this.source,
      locked: this.source !== 'manual',
      midiInput: this.midiInput,
      available: { midi: true, link: this.linkAvailable },
    };
  }

  /** Available MIDI input port names (for the clock-source device picker). */
  async midiInputs(): Promise<string[]> {
    try { return await this.midi.listInputs(); } catch { return []; }
  }

  /**
   * Set the master tempo. Always applies — used by project load / reset and by the
   * active clock source. The IPC manual path guards on `locked` before calling this,
   * so an external clock can't be overridden by a stray typed value.
   */
  setBpm(bpm: number): number {
    const next = clampBpm(bpm);
    if (next !== this.bpm) {
      this.bpm = next;
      engine.scenes.setBpm(this.bpm);
      this.link?.setBpm(this.bpm);   // broadcast manual edits into a Link session
      this.emitChanged();
    }
    return this.bpm;
  }

  /** Renderer audio-detector estimate — honoured only while 'audio' is the source. */
  applyAudioBpm(bpm: number): void { if (this.source === 'audio') this.setBpm(bpm); }

  /** Restore default tempo (project new). */
  reset(): void { this.setBpm(120); }

  /**
   * Switch the active clock source, tearing down the previous driver and starting
   * the new one. `midiInput` is remembered across sources (so re-selecting 'midi'
   * keeps the device), but the clock only opens while the source IS 'midi'.
   */
  async setSource(source: TempoSource, midiInput: string | null = this.midiInput): Promise<TransportStatus> {
    if (source === this.source && midiInput === this.midiInput) return this.status();
    await this.teardown();
    this.source = source;
    this.midiInput = midiInput;

    if (source === 'midi' && midiInput) {
      this.midiClock = new MidiClockSource(this.midi, midiInput, (bpm) => this.setBpm(bpm));
      try {
        await this.midiClock.start();
      } catch (err) {
        console.error('[transport] MIDI clock open failed:', (err as Error).message);
        this.midiClock = null;
      }
    } else if (source === 'link') {
      this.link = new LinkSource((bpm) => this.setBpm(bpm));
      this.linkAvailable = await this.link.start();
      if (!this.linkAvailable) this.link = null;   // addon missing → stays selected but inert
    }
    // 'audio' has no main-side driver: the renderer pushes estimates via applyAudioBpm.

    this.emitChanged();
    return this.status();
  }

  private async teardown(): Promise<void> {
    if (this.midiClock) { await this.midiClock.stop(); this.midiClock = null; }
    if (this.link) { await this.link.stop(); this.link = null; }
  }

  private emitChanged(): void { this.emit('changed', this.status()); }
}

export const transport = new Transport();
