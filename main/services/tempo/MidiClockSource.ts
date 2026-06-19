// MIDI-clock tempo source — derives BPM from an external MIDI clock. The MIDI
// standard sends 24 timing pulses per quarter-note (PPQN); the tempo is the
// pulse rate divided by 24. We average the pulse interval over roughly one beat
// for a stable reading and reset the window on transport start/stop or after a
// pause (clock disconnected). Reuses the engine MIDI backend (src/midi).

import { performance } from 'node:perf_hooks';
import type { MidiManager, MidiInput } from '../../../src/index';

const PPQN = 24;             // MIDI clock pulses per quarter-note
const WINDOW = PPQN;         // average over ~one beat for a steady BPM
const GAP_RESET_MS = 1000;   // a longer pause means the clock stopped — restart

const MIN_BPM = 20;
const MAX_BPM = 300;

export class MidiClockSource {
  private input: MidiInput | null = null;
  private stamps: number[] = [];   // recent clock-pulse timestamps (ms)
  private lastBpm = 0;

  constructor(
    private readonly midi: MidiManager,
    private readonly deviceName: string,
    private readonly onBpm: (bpm: number) => void,
  ) {}

  async start(): Promise<void> {
    this.input = await this.midi.openInput(this.deviceName);
    this.input.on('clock', this.onTick);
    this.input.on('start', this.onReset);
    this.input.on('continue', this.onReset);
    this.input.on('stop', this.onReset);
    await this.input.open();
  }

  async stop(): Promise<void> {
    if (!this.input) return;
    this.input.off('clock', this.onTick);
    this.input.off('start', this.onReset);
    this.input.off('continue', this.onReset);
    this.input.off('stop', this.onReset);
    try { await this.input.close(); } catch { /* already gone */ }
    this.input = null;
    this.stamps = [];
  }

  private onReset = (): void => { this.stamps = []; };

  private onTick = (): void => {
    const now = performance.now();
    const last = this.stamps[this.stamps.length - 1];
    if (last != null && now - last > GAP_RESET_MS) this.stamps = [];
    this.stamps.push(now);
    if (this.stamps.length > WINDOW + 1) this.stamps.shift();
    if (this.stamps.length < 2) return;

    const span = this.stamps[this.stamps.length - 1] - this.stamps[0];
    const perPulse = span / (this.stamps.length - 1);   // ms between pulses
    const bpm = Math.round(60000 / (perPulse * PPQN));
    if (bpm !== this.lastBpm && bpm >= MIN_BPM && bpm <= MAX_BPM) {
      this.lastBpm = bpm;
      this.onBpm(bpm);
    }
  };
}
