import { describe, it, expect } from 'vitest';
import { GOBO_GRID, encodeGobo, decodeGobo, isGoboPattern } from '../../src/index';

const CELLS = GOBO_GRID * GOBO_GRID;

describe('gobo pattern codec', () => {
  it('round-trips an arbitrary bit grid', () => {
    const bits = Array.from({ length: CELLS }, (_, i) => i % 3 === 0);
    const wire = encodeGobo(bits);
    expect(decodeGobo(wire)).toEqual(bits);
  });

  it('encodes the prefixed wire format', () => {
    expect(encodeGobo(new Array(CELLS).fill(false)).startsWith('g16:')).toBe(true);
  });

  it('preserves the four corner cells (boundary packing)', () => {
    const bits = new Array(CELLS).fill(false);
    bits[0] = true;                 // top-left
    bits[GOBO_GRID - 1] = true;     // top-right
    bits[CELLS - GOBO_GRID] = true; // bottom-left
    bits[CELLS - 1] = true;         // bottom-right
    expect(decodeGobo(encodeGobo(bits))).toEqual(bits);
  });

  it('decodes invalid / missing input as all-off', () => {
    expect(decodeGobo(null)).toEqual(new Array(CELLS).fill(false));
    expect(decodeGobo('not-a-pattern')).toEqual(new Array(CELLS).fill(false));
  });

  it('isGoboPattern recognises a well-formed string only', () => {
    expect(isGoboPattern(encodeGobo([true]))).toBe(true);
    expect(isGoboPattern('g16:')).toBe(false); // prefix but no payload
    expect(isGoboPattern(123)).toBe(false);
    expect(isGoboPattern('plain')).toBe(false);
  });
});
