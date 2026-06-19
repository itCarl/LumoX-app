// Audio-sync tempo detector — estimates BPM from the microphone / line input by
// energy-flux onset detection. Runs entirely in the renderer (Web Audio has no
// main-process equivalent); the estimate is pushed to the main Transport, which
// applies it only while 'audio' is the active source. Started/stopped as the user
// switches the BPM source (see renderer/index.ts).
//
// Method: sample the low-frequency (bass) energy at a fixed rate, flag an onset
// when it spikes above a short rolling average (with a refractory gap to avoid
// double-triggers), fold the inter-onset intervals into a 70–180 BPM range, and
// report the most common value once it's stable. Approximate, but enough to lock
// beat-synced scenes to live music.

const SAMPLE_MS = 20;          // energy poll period (~50 Hz)
const HISTORY = 50;            // rolling-average window (~1 s)
const THRESHOLD = 1.35;        // onset = energy > THRESHOLD × local average
const REFRACTORY_MS = 250;     // ignore onsets closer than this (max ~240 BPM)
const MAX_ONSETS = 24;         // inter-onset intervals kept for the estimate
const EMIT_MS = 500;           // how often to (re)report the estimate
const MIN_BPM = 70;
const MAX_BPM = 180;

export interface AudioTempo {
  stop(): void;
}

/** Fold a raw BPM into the [MIN_BPM, MAX_BPM) octave (treats half/double-time alike). */
function foldBpm(bpm: number): number {
  let b = bpm;
  while (b < MIN_BPM) b *= 2;
  while (b >= MAX_BPM) b /= 2;
  return b;
}

/**
 * Begin analysing the default audio input and report tempo estimates via `onBpm`.
 * @throws if microphone access is denied / unavailable.
 */
export async function startAudioTempo(onBpm: (bpm: number) => void): Promise<AudioTempo> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
  });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);

  const bins = new Uint8Array(analyser.frequencyBinCount);
  const energyLog: number[] = [];   // recent low-band energies (rolling average)
  const onsets: number[] = [];      // recent onset timestamps (ms)
  let lastOnset = 0;
  let lastEmit = 0;

  const tick = (): void => {
    analyser.getByteFrequencyData(bins);
    // Bass band ≈ first few bins (bin ≈ 43 Hz at 44.1 kHz / 1024). Skip DC.
    let energy = 0;
    for (let i = 1; i <= 6; i++) energy += bins[i];

    energyLog.push(energy);
    if (energyLog.length > HISTORY) energyLog.shift();
    const avg = energyLog.reduce((a, b) => a + b, 0) / energyLog.length;

    const now = performance.now();
    if (energy > avg * THRESHOLD && energy > 8 && now - lastOnset > REFRACTORY_MS) {
      lastOnset = now;
      onsets.push(now);
      if (onsets.length > MAX_ONSETS) onsets.shift();
    }

    if (now - lastEmit > EMIT_MS && onsets.length >= 4) {
      lastEmit = now;
      const bpm = estimate(onsets);
      if (bpm) onBpm(bpm);
    }
  };

  const timer = window.setInterval(tick, SAMPLE_MS);

  return {
    stop(): void {
      window.clearInterval(timer);
      try { src.disconnect(); } catch { /* already gone */ }
      void ctx.close();
      for (const t of stream.getTracks()) t.stop();
    },
  };
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
