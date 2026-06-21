import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/index';
import type { MixContext } from '../../src/mix/MixModule';

const ctx = (now = 0): MixContext => ({ now, deltaMs: 1000 / 44, frame: 1 });

/** Drive one deterministic pipeline pass over a universe (no timer). */
function processOnce(engine: Engine, universeId = 0): Uint8Array {
  const u = engine.universes.get(universeId)!;
  engine.mix.process(u, ctx());
  return u.data;
}

describe('default mix pipeline', () => {
  it('builds the documented stage order', () => {
    const engine = new Engine();
    expect(engine.mix.list().map((m) => m.name)).toEqual([
      'Base Layer', 'Scene Mixer', 'Effects', 'Group Effects',
      'Limits', 'Virtual Dimmer', 'Grand Master', 'Blackout',
    ]);
  });

  it('BaseLayer copies the programmer into data each pass', () => {
    const engine = new Engine();
    const u = engine.universes.ensure(0);
    u.setChannel(1, 180);
    expect(processOnce(engine)[0]).toBe(180);
  });

  it('GrandMaster scales the whole frame after the scene/base layers', () => {
    const engine = new Engine();
    const u = engine.universes.ensure(0);
    u.setChannel(1, 200);
    engine.grandMaster.setValue(0.5);
    expect(processOnce(engine)[0]).toBe(100);
  });

  it('Blackout zeroes the frame as the final stage', () => {
    const engine = new Engine();
    const u = engine.universes.ensure(0);
    u.setChannel(1, 255);
    engine.blackout.set(true);
    expect(processOnce(engine)[0]).toBe(0);
    engine.blackout.set(false);
    expect(processOnce(engine)[0]).toBe(255);
  });

  it('skips disabled modules', () => {
    const engine = new Engine();
    const u = engine.universes.ensure(0);
    u.setChannel(1, 200);
    engine.grandMaster.setValue(0.5);
    engine.grandMaster.enabled = false;
    expect(processOnce(engine)[0]).toBe(200); // master bypassed
  });

  it('runs the pipeline per universe independently', () => {
    const engine = new Engine();
    engine.universes.ensure(0).setChannel(1, 10);
    engine.universes.ensure(1).setChannel(1, 20);
    expect(processOnce(engine, 0)[0]).toBe(10);
    expect(processOnce(engine, 1)[0]).toBe(20);
  });
});
