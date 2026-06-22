import { describe, it, expect } from 'vitest';
import { SceneMixer, Universe, TOTAL_CHANNELS } from '../../src/index';
import type { MixContext } from '../../src/mix/MixModule';

const ctx = (now = 0): MixContext => ({ now, deltaMs: 1000 / 44, frame: 1 });

/** A scene look: a TOTAL_CHANNELS buffer with the given 1-based channels set. */
function look(channels: Record<number, number>): Uint8Array {
  const b = new Uint8Array(TOTAL_CHANNELS);
  for (const [ch, v] of Object.entries(channels)) b[Number(ch) - 1] = v;
  return b;
}

describe('SceneMixer — static blend', () => {
  it('HTP-blends a static look over the frame, scaled by opacity', () => {
    const mixer = new SceneMixer();
    const u = new Universe(0);
    mixer.addTrack({ id: 's1', opacity: 1, values: { 0: look({ 1: 100, 2: 50 }) } });
    mixer.process(u, ctx());
    expect([u.getChannel(1), u.getChannel(2)]).toEqual([100, 50]);

    mixer.setOpacity('s1', 0.5);
    u.data.fill(0);
    mixer.process(u, ctx());
    expect(u.getChannel(1)).toBe(50);
  });

  it('keeps the higher value on a shared channel (HTP, not overwrite)', () => {
    const mixer = new SceneMixer();
    const u = new Universe(0);
    u.data[0] = 200; // a brighter base already in the frame
    mixer.addTrack({ id: 's1', opacity: 1, values: { 0: look({ 1: 100 }) } });
    mixer.process(u, ctx());
    expect(u.getChannel(1)).toBe(200);
  });

  it('an opacity-0 track contributes nothing', () => {
    const mixer = new SceneMixer();
    const u = new Universe(0);
    mixer.addTrack({ id: 's1', opacity: 0, values: { 0: look({ 1: 255 }) } });
    mixer.process(u, ctx());
    expect(u.getChannel(1)).toBe(0);
  });
});

describe('SceneMixer — priority tiers', () => {
  it('a high-priority scene claims its channels from lower tiers', () => {
    const mixer = new SceneMixer();
    const u = new Universe(0);
    mixer.addTrack({ id: 'low', priority: 'normal', opacity: 1, values: { 0: look({ 1: 100, 2: 100 }) } });
    mixer.addTrack({ id: 'high', priority: 'high', opacity: 1, values: { 0: look({ 1: 200 }) } });
    mixer.process(u, ctx());
    // ch1 is claimed by the high tier (200); ch2 is untouched by it, so the
    // normal tier still writes there.
    expect([u.getChannel(1), u.getChannel(2)]).toEqual([200, 100]);
  });

  it('all-normal scenes blend as a flat HTP pass', () => {
    const mixer = new SceneMixer();
    const u = new Universe(0);
    mixer.addTrack({ id: 'a', opacity: 1, values: { 0: look({ 1: 80 }) } });
    mixer.addTrack({ id: 'b', opacity: 1, values: { 0: look({ 1: 150 }) } });
    mixer.process(u, ctx());
    expect(u.getChannel(1)).toBe(150);
  });
});

describe('SceneMixer — fades (update is the sole writer)', () => {
  it('ramps opacity linearly over the fade time', () => {
    const mixer = new SceneMixer();
    mixer.addTrack({ id: 's', opacity: 0, values: { 0: look({ 1: 200 }) } });
    mixer.fadeTo('s', 1, 1); // fade to full over 1s
    mixer.update(500);
    expect(mixer.tracks.get('s')!.opacity).toBeCloseTo(0.5, 5);
    mixer.update(500);
    expect(mixer.tracks.get('s')!.opacity).toBe(1);
  });

  it('fade with seconds=0 settles instantly and marks the track inactive at 0', () => {
    const mixer = new SceneMixer();
    mixer.addTrack({ id: 's', opacity: 1, values: { 0: look({ 1: 200 }) } });
    mixer.fadeTo('s', 0, 0);
    expect(mixer.tracks.get('s')!.opacity).toBe(0);
    expect(mixer.consumeWentInactive()).toEqual(['s']);
    expect(mixer.consumeWentInactive()).toEqual([]); // drained
  });

  it('isLive covers a fading-in track before its opacity rises', () => {
    const mixer = new SceneMixer();
    mixer.addTrack({ id: 's', opacity: 0, values: {} });
    mixer.fadeTo('s', 1, 2);
    expect(mixer.isLive('s')).toBe(true); // fading toward a positive target
  });

  it('honours a pre-delay before ramping', () => {
    const mixer = new SceneMixer();
    mixer.addTrack({ id: 's', opacity: 0, values: {} });
    mixer.fadeTo('s', 1, 1, 300); // 300ms pre-delay
    mixer.update(300);
    expect(mixer.tracks.get('s')!.opacity).toBe(0); // still waiting
    mixer.update(500);
    expect(mixer.tracks.get('s')!.opacity).toBeCloseTo(0.5, 5);
  });
});

describe('SceneMixer — dipless crossfade (startTransition)', () => {
  it('does not dip a channel that is full in both the outgoing and incoming look', () => {
    const mixer = new SceneMixer();
    const u = new Universe(0);
    // A: ch1 full, ch2 off (live). B: ch1 full, ch2 full (incoming).
    mixer.addTrack({ id: 'A', opacity: 1, values: { 0: look({ 1: 255, 2: 0 }) } });
    mixer.addTrack({ id: 'B', opacity: 0, values: { 0: look({ 1: 255, 2: 255 }) } });
    mixer.startTransition({ toId: 'B', level: 1, fromIds: ['A'], totalMs: 1000 });

    mixer.update(500); // half-way through the crossfade
    mixer.process(u, ctx());
    expect(u.getChannel(1)).toBe(255);   // shared full channel never dips
    expect(u.getChannel(2)).toBe(127);   // 0 → 255 interpolated at the midpoint
  });

  it('leaves a coexisting scene outside the crossfade untouched', () => {
    const mixer = new SceneMixer();
    const u = new Universe(0);
    mixer.addTrack({ id: 'A', opacity: 1, values: { 0: look({ 1: 255 }) } });
    mixer.addTrack({ id: 'B', opacity: 0, values: { 0: look({ 1: 255 }) } });
    mixer.addTrack({ id: 'C', opacity: 1, values: { 0: look({ 10: 200 }) } }); // other bank
    mixer.startTransition({ toId: 'B', level: 1, fromIds: ['A'], totalMs: 1000 });

    mixer.update(500);
    mixer.process(u, ctx());
    expect(u.getChannel(10)).toBe(200);  // C keeps running through the crossfade
  });

  it('drops the outgoing track and signals inactivity when the crossfade completes', () => {
    const mixer = new SceneMixer();
    const u = new Universe(0);
    mixer.addTrack({ id: 'A', opacity: 1, values: { 0: look({ 2: 0 }) } });
    mixer.addTrack({ id: 'B', opacity: 0, values: { 0: look({ 2: 255 }) } });
    mixer.startTransition({ toId: 'B', level: 1, fromIds: ['A'], totalMs: 1000 });

    mixer.process(u, ctx());  // capture the outgoing snapshot
    mixer.update(1000);       // run the crossfade to completion
    expect(mixer.tracks.has('A')).toBe(false);          // outgoing removed
    expect(mixer.consumeWentInactive()).toContain('A'); // broadcast gating notified
    expect(mixer.tracks.get('B')!.opacity).toBe(1);     // incoming live at its level

    u.data.fill(0);
    mixer.process(u, ctx());
    expect(u.getChannel(2)).toBe(255);   // incoming fully in afterwards
  });
});

describe('SceneMixer — counted loop completion', () => {
  it('signals once after running loopCount cycles', () => {
    const mixer = new SceneMixer();
    mixer.addTrack({
      id: 'c', type: 'chase', opacity: 1, loopCount: 1, rateMs: 100,
      stepValues: [{ 0: look({ 1: 11 }) }, { 0: look({ 1: 22 }) }],
    });
    mixer.resetPhase('c', 'restart');
    // cycle = 2 steps × 100ms = 200ms; nothing yet at 150ms
    mixer.update(150);
    expect(mixer.consumeCompleted()).toEqual([]);
    mixer.update(100); // total 250ms ≥ 200ms
    expect(mixer.consumeCompleted()).toEqual(['c']);
    expect(mixer.consumeCompleted()).toEqual([]); // signalled once
  });
});

describe('SceneMixer — chase stepping', () => {
  it('walks steps on its phase clock', () => {
    const mixer = new SceneMixer();
    const u = new Universe(0);
    mixer.addTrack({
      id: 'c', type: 'chase', opacity: 1, rateMs: 100,
      stepValues: [{ 0: look({ 1: 11 }) }, { 0: look({ 1: 22 }) }],
    });
    mixer.resetPhase('c', 'restart');

    mixer.process(u, ctx());
    expect(u.getChannel(1)).toBe(11); // step 0 at phase 0

    mixer.update(100); // advance one period
    u.data.fill(0);
    mixer.process(u, ctx());
    expect(u.getChannel(1)).toBe(22); // step 1
  });

  it('plays backward direction in reverse step order', () => {
    const mixer = new SceneMixer();
    const u = new Universe(0);
    mixer.addTrack({
      id: 'c', type: 'chase', opacity: 1, rateMs: 100, direction: 'backward',
      stepValues: [{ 0: look({ 1: 1 }) }, { 0: look({ 1: 2 }) }, { 0: look({ 1: 3 }) }],
    });
    mixer.resetPhase('c', 'restart');
    mixer.update(100); // raw step 1 → backward maps to step 2
    mixer.process(u, ctx());
    expect(u.getChannel(1)).toBe(3);
  });
});

describe('SceneMixer — period from tempo', () => {
  it('free-run period = rateMs / speed', () => {
    const mixer = new SceneMixer();
    expect(mixer.effectivePeriod({ rateMs: 1000, speed: 2 } as any)).toBe(500);
  });

  it('bpm-driven period = (60000 / bpm) / beatDiv', () => {
    const mixer = new SceneMixer();
    mixer.setBpm(120); // beat = 500ms
    expect(mixer.effectivePeriod({ driveMode: 'bpm', beatDiv: 1 } as any)).toBe(500);
    expect(mixer.effectivePeriod({ driveMode: 'bpm', beatDiv: 2 } as any)).toBe(250);
  });

  it('clamps bpm into a sane range', () => {
    const mixer = new SceneMixer();
    mixer.setBpm(5);
    expect(mixer.bpm).toBe(20);
    mixer.setBpm(9000);
    expect(mixer.bpm).toBe(300);
  });
});
