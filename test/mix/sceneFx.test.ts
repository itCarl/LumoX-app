import { describe, it, expect } from 'vitest';
import { renderColorFx, renderMoveFx, renderWaveFx, renderChaserFx } from '../../src/index';
import { TOTAL_CHANNELS } from '../../src/index';

const frame = () => new Uint8Array(TOTAL_CHANNELS);

describe('renderColorFx', () => {
  it('with no palette, paints a rainbow — fixture 0 at t=0 is pure red', () => {
    const buf = frame();
    renderColorFx(buf, [[1, 2, 3]], 0);
    expect([buf[0], buf[1], buf[2]]).toEqual([255, 0, 0]); // hue 0 → red
  });

  it('samples a single-stop palette as a flat colour', () => {
    const buf = frame();
    renderColorFx(buf, [[1, 2, 3], [4, 5, 6]], 1234, 4000, 30, {
      palette: ['#00ff00'], colorWidth: 1, angle: 0,
    } as never);
    expect([buf[0], buf[1], buf[2]]).toEqual([0, 255, 0]);
    expect([buf[3], buf[4], buf[5]]).toEqual([0, 255, 0]);
  });

  it('grayscale collapses to a single luminance on all channels', () => {
    const buf = frame();
    renderColorFx(buf, [[1, 2, 3]], 0, 4000, 30, { palette: [], colorWidth: 1, angle: 0, grayscale: true } as never);
    expect(buf[0]).toBe(buf[1]);
    expect(buf[1]).toBe(buf[2]);
  });
});

describe('renderMoveFx', () => {
  it('circle path at t=0 sits at pan centre, tilt at +size', () => {
    const buf = frame();
    renderMoveFx(buf, [[1, 2]], 0, 4000, 96, 30);
    expect(buf[0]).toBe(128);       // pan = centre (sin 0)
    expect(buf[1]).toBe(128 + 96);  // tilt = centre + size (cos 0)
  });

  it('respects a custom centre', () => {
    const buf = frame();
    renderMoveFx(buf, [[1, 2]], 0, 4000, 96, 30, { shape: 'circle', centerX: 100, centerY: 100 } as never);
    expect(buf[0]).toBe(100);
    expect(buf[1]).toBe(100 + 96);
  });
});

describe('renderWaveFx', () => {
  it('a sine wave at t=0 sits at the mid-point of [min,max]', () => {
    const buf = frame();
    renderWaveFx(buf, [[1]], 0);
    expect(buf[0]).toBe(128); // (sin0+1)/2 = 0.5 → 127.5 → 128
  });

  it('a non-null staticValue holds a flat level (no animation)', () => {
    const buf = frame();
    renderWaveFx(buf, [[1]], 9999, 4000, 30, { waveform: 'sine', min: 0, max: 255, duty: 0.5, invert: false, staticValue: 200 } as never);
    expect(buf[0]).toBe(200);
  });

  it('invert flips the waveform', () => {
    const a = frame(), b = frame();
    const cfg = (invert: boolean) => ({ waveform: 'sawtooth', min: 0, max: 255, duty: 0.5, invert }) as never;
    renderWaveFx(a, [[1]], 1000, 4000, 0, cfg(false));
    renderWaveFx(b, [[1]], 1000, 4000, 0, cfg(true));
    expect(a[0] + b[0]).toBe(255);
  });
});

describe('renderChaserFx', () => {
  it('lights the head fixture at t=0 and leaves the rest at background', () => {
    const buf = frame();
    renderChaserFx(buf, [[1], [2], [3]], 0, 4000, { litCount: 1, gap: 0, fade: 0, level: 255, bg: 0 } as never);
    expect([buf[0], buf[1], buf[2]]).toEqual([255, 0, 0]);
  });

  it('an empty target list is a no-op', () => {
    const buf = frame();
    expect(() => renderChaserFx(buf, [], 0)).not.toThrow();
  });

  it('at an integer head position it matches the classic stepped look', () => {
    const buf = frame();
    // period 3000, n 3 ⇒ headF = now/1000; now 1000 ⇒ headF = 1 (head on fixture 1)
    renderChaserFx(buf, [[1], [2], [3]], 1000, 3000, { litCount: 1, gap: 0, fade: 0, level: 255, bg: 0 } as never);
    expect([buf[0], buf[1], buf[2]]).toEqual([0, 255, 0]);
  });

  it('between fixtures the head flows continuously (no snap)', () => {
    const buf = frame();
    // headF = 0.5 ⇒ the comet sits half-way between fixture 0 and fixture 1
    renderChaserFx(buf, [[1], [2], [3]], 500, 3000, { litCount: 1, gap: 0, fade: 0, level: 255, bg: 0 } as never);
    // fixture 0 fading out, fixture 1 leading in — both ~half, neither full nor dark
    expect(buf[0]).toBeGreaterThan(0);
    expect(buf[0]).toBeLessThan(255);
    expect(buf[1]).toBeGreaterThan(0);
    expect(buf[1]).toBeLessThan(255);
    expect(Math.abs(buf[0] - buf[1])).toBeLessThanOrEqual(1); // symmetric hand-off
    expect(buf[2]).toBe(0);
  });
});
