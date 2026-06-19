// 25 — Colour: the engine's DMX-byte helpers + culori for the maths.
// Prints and exits (no tick loop).
//
//   node examples/25-color-utility.js

import { hsvToBytes, hexToBytes } from '../src/index';
import { converter, parse, formatHex, interpolate, wcagLuminance } from 'culori';

// --- engine helpers: straight to DMX bytes (0..255) ----------------------
console.log('engine DMX-byte bridges:');
console.log('  hexToBytes("#ff8000")', hexToBytes('#ff8000'));
console.log('  hsvToBytes(30,1,1)   ', hsvToBytes(30, 1, 1));

// --- culori for everything richer (works in 0..1) ------------------------
const toHsl = converter('hsl');
const toHwb = converter('hwb');
const orange = parse('#ff8000')!;

console.log('\n#ff8000 in other models (culori):');
console.log('  hsl', toHsl(orange));
console.log('  hwb', toHwb(orange));
console.log('  luminance', wcagLuminance('#ff8000').toFixed(3));

// --- perceptual blend: interpolate red→blue in OkLab, sample the midpoint -
const mid = interpolate(['red', 'blue'], 'oklab')(0.5);
console.log('\nred→blue midpoint (OkLab):', formatHex(mid));

// --- feed the engine: dim a colour, hand DMX bytes to setRGB-style calls --
const { r, g, b } = hexToBytes('#ff8000');
const dim = 0.75;
console.log('\ndimmed orange as DMX bytes:', {
  r: Math.round(r * dim), g: Math.round(g * dim), b: Math.round(b * dim),
});
