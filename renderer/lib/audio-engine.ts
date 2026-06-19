// Audio engine — a single shared Web Audio capture feeding many consumers. It owns
// one `getUserMedia` stream + `AnalyserNode` and exposes:
//   • a SPECTRUM reader — N log-spaced frequency bands (40 Hz–5 kHz) + an overall
//     volume level + a beat flag, each normalised to 0..1, and
//   • the BPM detector — energy-flux onset detection on the bass band.
// One capture, many consumers, so BPM, the live meter and (later) reactive bindings
// never fight over the input. Runs only in the renderer (Web Audio has no main-process
// equivalent); estimates/levels are pushed to main over IPC by the callers.
//
// Capture is reference-counted: it opens on the first subscriber and tears down with
// the last. The input device is selectable (a `deviceId`, or null = system default);
// changing it re-opens the capture. Absorbs the former audio-tempo.ts.
//
// Band method follows the established console recipe: bound the spectrum to a musical
// 40–5000 Hz range and split it logarithmically (matches human pitch perception, so
// bass/mid/treble get fair width), mean-magnitude per band, normalised against a
// decaying per-band peak so each lands in 0..1 regardless of input gain.

const SAMPLE_MS = 20;            // analyser poll period (~50 Hz)
const FFT_SIZE = 2048;           // → 1024 magnitude bins
const SMOOTHING = 0.6;           // AnalyserNode time smoothing

// ---- spectrum bands ----
const F_MIN = 40;                // lowest band edge (Hz)
const F_MAX = 5000;              // highest band edge (Hz)
const DEFAULT_BANDS = 8;
const MAX_BANDS = 32;
const PEAK_DECAY = 0.995;        // per-tick decay of the per-band auto-gain peak
const PEAK_FLOOR = 0.02;         // ignore peaks below this (silence → 0, not noise gain)
const ATTACK = 0.6;             // display smoothing toward a rising value
const DECAY = 0.18;             // display smoothing toward a falling value

// ---- BPM (onset) detection ----
const HISTORY = 50;              // rolling-average window (~1 s)
const THRESHOLD = 1.35;          // onset = bass energy > THRESHOLD × local average
const REFRACTORY_MS = 250;       // ignore onsets closer than this (max ~240 BPM)
const MAX_ONSETS = 24;
const EMIT_MS = 500;             // BPM (re)report cadence
const MIN_BPM = 70;
const MAX_BPM = 180;

export interface SpectrumFrame {
  /** Per-band level, 0..1, low → high frequency. Length = bandCount. */
  bands: number[];
  /** Overall loudness, 0..1. */
  volume: number;
  /** True on the tick an onset (beat) is detected. */
  beat: boolean;
}

export type AudioState = 'idle' | 'running' | 'denied';
export type Unsubscribe = () => void;

type SpectrumCb = (frame: SpectrumFrame) => void;
type BpmCb = (bpm: number) => void;
type StateCb = (state: AudioState) => void;

class AudioEngine {
  private deviceId: string | null = null;
  private bandCount = DEFAULT_BANDS;

  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private bins: Uint8Array = new Uint8Array(0);
  private timer = 0;
  private opening = false;
  private state: AudioState = 'idle';

  private readonly spectrumSubs = new Set<SpectrumCb>();
  private readonly bpmSubs = new Set<BpmCb>();
  private readonly stateSubs = new Set<StateCb>();

  // spectrum running state
  private peaks: number[] = [];
  private smoothed: number[] = [];
  private volumePeak = 0;

  // onset / BPM running state
  private energyLog: number[] = [];
  private onsets: number[] = [];
  private lastOnset = 0;
  private lastEmit = 0;

  /** Subscribe to spectrum frames (bands + volume + beat). Opens the capture. */
  onSpectrum(cb: SpectrumCb): Unsubscribe {
    this.spectrumSubs.add(cb);
    this.ensureCapture();
    return () => { this.spectrumSubs.delete(cb); this.maybeTeardown(); };
  }

  /** Subscribe to BPM estimates. Opens the capture. */
  onBpm(cb: BpmCb): Unsubscribe {
    this.bpmSubs.add(cb);
    this.ensureCapture();
    return () => { this.bpmSubs.delete(cb); this.maybeTeardown(); };
  }

  /** Subscribe to capture-state changes ('idle' | 'running' | 'denied'). */
  onState(cb: StateCb): Unsubscribe {
    this.stateSubs.add(cb);
    cb(this.state);
    return () => { this.stateSubs.delete(cb); };
  }

  getState(): AudioState { return this.state; }

  /** Number of frequency bands the spectrum reader produces (1..MAX_BANDS). */
  setBandCount(n: number): void {
    const v = Math.max(1, Math.min(MAX_BANDS, Math.round(n)));
    if (v === this.bandCount) return;
    this.bandCount = v;
    this.peaks = [];
    this.smoothed = [];
  }
  getBandCount(): number { return this.bandCount; }

  getDevice(): string | null { return this.deviceId; }

  /** Choose the input device (null = system default). Re-opens a live capture. */
  setDevice(deviceId: string | null): void {
    const id = deviceId || null;
    if (id === this.deviceId) return;
    this.deviceId = id;
    if (this.hasSubscribers()) { this.close(); void this.open(); }
  }

  private hasSubscribers(): boolean {
    return this.spectrumSubs.size > 0 || this.bpmSubs.size > 0;
  }

  private setState(s: AudioState): void {
    if (s === this.state) return;
    this.state = s;
    for (const cb of this.stateSubs) cb(s);
  }

  private ensureCapture(): void {
    if (!this.ctx && !this.opening && this.hasSubscribers()) void this.open();
  }

  private maybeTeardown(): void {
    if (!this.hasSubscribers()) this.close();
  }

  private async open(): Promise<void> {
    this.opening = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.deviceId ? { exact: this.deviceId } : undefined,
          echoCancellation: false, autoGainControl: false, noiseSuppression: false,
        },
      });
    } catch {
      this.opening = false;
      this.stream = null;
      this.setState('denied');
      return;
    }
    // A late teardown (last subscriber left while we awaited) — drop the stream.
    if (!this.hasSubscribers()) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null; this.opening = false;
      return;
    }
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = SMOOTHING;
    src.connect(this.analyser);
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.resetRunningState();
    this.timer = window.setInterval(() => this.tick(), SAMPLE_MS);
    this.opening = false;
    this.setState('running');
  }

  private close(): void {
    if (this.timer) { window.clearInterval(this.timer); this.timer = 0; }
    if (this.ctx) { void this.ctx.close(); this.ctx = null; }
    this.analyser = null;
    if (this.stream) { for (const t of this.stream.getTracks()) t.stop(); this.stream = null; }
    this.setState('idle');
  }

  private resetRunningState(): void {
    this.peaks = []; this.smoothed = []; this.volumePeak = 0;
    this.energyLog = []; this.onsets = []; this.lastOnset = 0; this.lastEmit = 0;
  }

  private tick(): void {
    const analyser = this.analyser;
    const ctx = this.ctx;
    if (!analyser || !ctx) return;
    analyser.getByteFrequencyData(this.bins as Uint8Array<ArrayBuffer>);
    const now = performance.now();

    const beat = this.detectBeat(now);
    if (this.bpmSubs.size && now - this.lastEmit > EMIT_MS && this.onsets.length >= 4) {
      this.lastEmit = now;
      const bpm = estimate(this.onsets);
      if (bpm) for (const cb of this.bpmSubs) cb(bpm);
    }

    if (this.spectrumSubs.size) {
      const frame = this.readSpectrum(ctx.sampleRate, beat);
      for (const cb of this.spectrumSubs) cb(frame);
    }
  }

  /** Bass-band energy-flux onset detection (drives the beat flag + BPM estimate). */
  private detectBeat(now: number): boolean {
    let energy = 0;
    for (let i = 1; i <= 6; i++) energy += this.bins[i];   // bass ≈ first few bins; skip DC
    this.energyLog.push(energy);
    if (this.energyLog.length > HISTORY) this.energyLog.shift();
    const avg = this.energyLog.reduce((a, b) => a + b, 0) / this.energyLog.length;

    if (energy > avg * THRESHOLD && energy > 8 && now - this.lastOnset > REFRACTORY_MS) {
      this.lastOnset = now;
      this.onsets.push(now);
      if (this.onsets.length > MAX_ONSETS) this.onsets.shift();
      return true;
    }
    return false;
  }

  /** N log-spaced bands + volume, each auto-gained to 0..1 and display-smoothed. */
  private readSpectrum(sampleRate: number, beat: boolean): SpectrumFrame {
    const n = this.bandCount;
    const maxBin = this.bins.length - 1;           // = fftSize/2 - 1
    const logRange = Math.log(F_MAX / F_MIN);
    const bands: number[] = new Array(n);
    let volSum = 0;

    for (let b = 0; b < n; b++) {
      const startFreq = F_MIN * Math.exp(logRange * (b / n));
      const endFreq = F_MIN * Math.exp(logRange * ((b + 1) / n));
      let startBin = Math.floor((startFreq * FFT_SIZE) / sampleRate);
      let endBin = Math.floor((endFreq * FFT_SIZE) / sampleRate);
      startBin = Math.max(1, Math.min(startBin, maxBin));
      endBin = Math.max(startBin + 1, Math.min(endBin, maxBin));

      let sum = 0;
      for (let i = startBin; i < endBin; i++) sum += this.bins[i];
      const raw = sum / ((endBin - startBin) * 255);     // 0..1 mean magnitude
      volSum += raw;

      const peak = Math.max(raw, (this.peaks[b] ?? 0) * PEAK_DECAY);
      this.peaks[b] = peak;
      const norm = peak > PEAK_FLOOR ? Math.min(1, raw / peak) : 0;

      const prev = this.smoothed[b] ?? 0;
      const k = norm > prev ? ATTACK : DECAY;
      const next = prev + (norm - prev) * k;
      this.smoothed[b] = next;
      bands[b] = next;
    }

    const rawVol = volSum / n;
    this.volumePeak = Math.max(rawVol, this.volumePeak * PEAK_DECAY);
    const volume = this.volumePeak > PEAK_FLOOR ? Math.min(1, rawVol / this.volumePeak) : 0;

    return { bands, volume, beat };
  }
}

/** Fold a raw BPM into the [MIN_BPM, MAX_BPM) octave (treats half/double-time alike). */
function foldBpm(bpm: number): number {
  let b = bpm;
  while (b < MIN_BPM) b *= 2;
  while (b >= MAX_BPM) b /= 2;
  return b;
}

/** Most common folded BPM across the inter-onset intervals, or 0 if undecided. */
function estimate(onsets: number[]): number {
  const votes = new Map<number, number>();
  for (let i = 1; i < onsets.length; i++) {
    const dt = onsets[i] - onsets[i - 1];
    if (dt <= 0) continue;
    const bpm = Math.round(foldBpm(60000 / dt));
    votes.set(bpm, (votes.get(bpm) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = 0;
  for (const [bpm, count] of votes) {
    if (count > bestCount) { best = bpm; bestCount = count; }
  }
  return bestCount >= 2 ? best : 0;
}

/** The single shared audio capture for the whole renderer. */
export const audioEngine = new AudioEngine();
