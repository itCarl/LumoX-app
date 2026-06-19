// 26 — Scene playback: fades, phase clock, tempo & direction.
//
// Drives the SceneMixer directly (no Electron) to exercise the playback model
// the Scene Properties panel sits on top of:
//   - update(deltaMs) advances fades + each track's phase clock ONCE per tick
//   - process(universe, ctx) is a pure reader, run per universe per tick
//   - chase stepping, BPM sync, pause, and direction (forward/backward/bounce)
//
// It also self-checks the key invariants with assertions, so it doubles as a
// regression test:
//
//   npm run example examples/26-scene-playback.ts

import assert from 'node:assert';
import { SceneMixer, Universe, DMX_CHANNELS } from '../src/index';

const mixer = new SceneMixer();

// Two universes — used to prove the per-universe process() does NOT double-
// advance the phase clock (that must happen only in update()).
const u0 = new Universe(0);
const u1 = new Universe(1);
let now = 0;
const ctx = { now: 0, deltaMs: 0, frame: 0 };

// Simulate one engine tick: advance state once, then render each universe.
function tick(deltaMs: number): void {
  now += deltaMs;
  ctx.now = now;
  ctx.deltaMs = deltaMs;
  ctx.frame++;
  mixer.update(deltaMs);               // sole writer of fades + phase clocks
  for (const u of [u0, u1]) {
    u.data.fill(0);                    // BaseLayer normally clears the frame
    mixer.process(u, ctx);             // pure reader
  }
}

// A 4-step chase: step k paints value (k+1)*10 at channel 1 of BOTH universes.
function denseStep(value: number): Record<number, Uint8Array> {
  const a = new Uint8Array(DMX_CHANNELS); a[0] = value;
  const b = new Uint8Array(DMX_CHANNELS); b[0] = value;
  return { 0: a, 1: b };
}
const stepValues = [denseStep(10), denseStep(20), denseStep(30), denseStep(40)];
const step = () => Math.round(u0.data[0] / 10);   // 1..4 = current step

mixer.addTrack({
  id: 'chase', type: 'chase', opacity: 0,
  values: denseStep(10), stepValues,
  rateMs: 100, speed: 1, driveMode: 'off', beatDiv: 1, direction: 'forward',
});

// ---- (a) fade-in ramps opacity toward `level` over time ----------------
mixer.fadeTo('chase', 1, 1.0);          // 1s fade to full
tick(0);
assert.ok(mixer.tracks.get('chase')!.opacity === 0, 'fade starts at 0');
for (let i = 0; i < 20; i++) tick(50);  // 1000ms
assert.ok(Math.abs(mixer.tracks.get('chase')!.opacity - 1) < 1e-6, 'fade reaches level 1');
console.log('(a) fade-in ramp        OK  — opacity 0 → 1 over 1s');

// ---- (b) phase clock advances once per tick, not per universe ----------
// After the fades above, ~1000ms of phase elapsed at 100ms/step → step 1 (looped).
const stepAfter1s = step();
tick(100);                              // exactly one step period
assert.strictEqual(step(), (stepAfter1s % 4) + 1, 'one tick advances exactly one step');
console.log('(b) no double-advance    OK  — 2 universes, still 1 step/period');

// ---- (c) BPM sync: 120 BPM, beatDiv 1 → 500ms period -------------------
mixer.removeTrack('chase');             // isolate — one track writing ch1
mixer.setBpm(120);
mixer.addTrack({
  id: 'bpm', type: 'chase', opacity: 1,
  values: denseStep(10), stepValues,
  rateMs: 9999, speed: 1, driveMode: 'bpm', beatDiv: 1, direction: 'forward',
});
mixer.resetPhase('bpm', 'restart');     // phase 0 → step 1
tick(0);
const bpmStep0 = Math.round(u0.data[0] / 10);
for (let i = 0; i < 10; i++) tick(50);  // 500ms = one beat
const bpmStep1 = Math.round(u0.data[0] / 10);
assert.strictEqual(bpmStep1, (bpmStep0 % 4) + 1, '120 BPM advances one step per 500ms');
console.log('(c) BPM sync             OK  — 120 BPM ⇒ 500ms/step');

// ---- (d) pause freezes the phase clock ---------------------------------
mixer.pause('bpm');
const frozen = Math.round(u0.data[0] / 10);
for (let i = 0; i < 20; i++) tick(50);
assert.strictEqual(Math.round(u0.data[0] / 10), frozen, 'pause freezes the step');
mixer.resume('bpm');
console.log('(d) pause                OK  — phase frozen while paused');

// ---- (e) restart vs continue start modes -------------------------------
mixer.resetPhase('bpm', 'restart');
tick(0);
assert.strictEqual(Math.round(u0.data[0] / 10), 1, 'restart resets to step 1');
console.log('(e) start mode restart   OK  — phase reset to step 1');

// ---- (f) direction: backward steps in reverse --------------------------
mixer.removeTrack('chase');
mixer.removeTrack('bpm');
mixer.addTrack({
  id: 'rev', type: 'chase', opacity: 1,
  values: denseStep(10), stepValues,
  rateMs: 100, speed: 1, driveMode: 'off', beatDiv: 1, direction: 'backward',
});
mixer.resetPhase('rev', 'restart');
tick(0);
const r0 = Math.round(u0.data[0] / 10);
tick(100);
const r1 = Math.round(u0.data[0] / 10);
// forward would be 1 → 2; backward wraps 1 → 4
assert.strictEqual(r0, 1, 'backward starts at step 1');
assert.strictEqual(r1, 4, 'backward steps 1 → 4 (reverse)');
console.log('(f) direction backward   OK  — steps 1 → 4 (reverse)');

console.log('\nAll scene-playback invariants verified.');
