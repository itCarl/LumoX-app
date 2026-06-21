import { describe, it, expect } from 'vitest';
import { blendHTP, blendLTP, scaleAll, scaleMasked, buffersEqual } from '../../src/index';

const buf = (...v: number[]) => Uint8Array.from(v);

describe('blendHTP — highest takes precedence', () => {
  it('keeps the per-channel maximum', () => {
    const dst = buf(10, 200, 0);
    blendHTP(dst, buf(100, 50, 30));
    expect([...dst]).toEqual([100, 200, 30]);
  });

  it('scales the source by opacity before comparing', () => {
    const dst = buf(0, 0);
    blendHTP(dst, buf(200, 100), 0.5);
    expect([...dst]).toEqual([100, 50]);
  });

  it('opacity 0 contributes nothing', () => {
    const dst = buf(40, 0);
    blendHTP(dst, buf(255, 255), 0);
    expect([...dst]).toEqual([40, 0]);
  });
});

describe('blendLTP — latest takes precedence (crossfade)', () => {
  it('opacity 1 overwrites the destination', () => {
    const dst = buf(10, 20, 30);
    blendLTP(dst, buf(100, 110, 120), 1);
    expect([...dst]).toEqual([100, 110, 120]);
  });

  it('opacity 0 leaves the destination untouched', () => {
    const dst = buf(10, 20);
    blendLTP(dst, buf(255, 255), 0);
    expect([...dst]).toEqual([10, 20]);
  });

  it('crossfades linearly at partial opacity', () => {
    const dst = buf(0, 200);
    blendLTP(dst, buf(100, 0), 0.5);
    expect([...dst]).toEqual([50, 100]);
  });
});

describe('scaleAll / scaleMasked', () => {
  it('scaleAll multiplies every channel', () => {
    const dst = buf(100, 200, 50);
    scaleAll(dst, 0.5);
    expect([...dst]).toEqual([50, 100, 25]);
  });

  it('scaleAll factor >= 1 is a no-op; factor <= 0 zeroes', () => {
    const a = buf(100, 200);
    scaleAll(a, 1);
    expect([...a]).toEqual([100, 200]);
    scaleAll(a, 0);
    expect([...a]).toEqual([0, 0]);
  });

  it('scaleMasked only scales channels in the 1-based mask', () => {
    const dst = buf(100, 100, 100);
    scaleMasked(dst, 0.5, new Set([1, 3]));
    expect([...dst]).toEqual([50, 100, 50]);
  });
});

describe('buffersEqual', () => {
  it('compares length and contents', () => {
    expect(buffersEqual(buf(1, 2, 3), buf(1, 2, 3))).toBe(true);
    expect(buffersEqual(buf(1, 2, 3), buf(1, 2, 4))).toBe(false);
    expect(buffersEqual(buf(1, 2), buf(1, 2, 0))).toBe(false);
  });

  it('with len compares only the first len bytes (wire-region dirty check)', () => {
    expect(buffersEqual(buf(1, 2, 9), buf(1, 2, 0), 2)).toBe(true);   // differ past len → equal
    expect(buffersEqual(buf(1, 5, 9), buf(1, 2, 9), 2)).toBe(false);  // differ within len → not equal
    expect(buffersEqual(buf(1, 2, 3, 4), buf(1, 2), 2)).toBe(true);   // length mismatch ignored
  });
});
