import { describe, it, expect } from 'vitest';
import { hsvToBytes, hexToBytes } from '../../src/index';

describe('hsvToBytes — HSV → DMX bytes', () => {
  it('maps the primary hues to pure RGB', () => {
    expect(hsvToBytes(0, 1, 1)).toEqual({ r: 255, g: 0, b: 0 });
    const green = hsvToBytes(120, 1, 1);
    expect([Math.round(green.r), Math.round(green.g), Math.round(green.b)]).toEqual([0, 255, 0]);
    const blue = hsvToBytes(240, 1, 1);
    expect([Math.round(blue.r), Math.round(blue.g), Math.round(blue.b)]).toEqual([0, 0, 255]);
  });

  it('value scales brightness; saturation 0 is greyscale', () => {
    expect(hsvToBytes(0, 1, 0)).toEqual({ r: 0, g: 0, b: 0 });   // value 0 → black
    expect(hsvToBytes(0, 0, 1)).toEqual({ r: 255, g: 255, b: 255 }); // sat 0, value 1 → white
    const dim = hsvToBytes(0, 1, 0.5);
    expect(Math.round(dim.r)).toBe(128);
  });
});

describe('hexToBytes — CSS colour → DMX bytes', () => {
  it('parses #rrggbb and #rgb shorthand', () => {
    expect(hexToBytes('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToBytes('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToBytes('#000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('parses named colours', () => {
    expect(hexToBytes('red')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('falls back to black on an unparseable string', () => {
    expect(hexToBytes('not-a-colour')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToBytes('')).toEqual({ r: 0, g: 0, b: 0 });
  });
});
