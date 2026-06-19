// 25 — Color utility: the immutable Color value object + model conversions.
// Prints and exits (no tick loop).
//
//   node examples/25-color-utility.js

import {
  Color,
  hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb, rgbToCmy, cmyToRgb,
} from '../src/index';

// --- build from any model -------------------------------------------------
const fromHex = Color.fromHex('#ff8000');
const fromHsv = Color.fromHsv({ h: 30, s: 1, v: 1 });
const fromHsl = Color.fromHsl({ h: 30, s: 1, l: 0.5 });
const fromCmy = Color.fromCmy({ c: 0, m: 0.5, y: 1 });

console.log('orange built four ways:');
console.log('  fromHex', fromHex.toHex(), fromHex.toArray());
console.log('  fromHsv', fromHsv.toHex());
console.log('  fromHsl', fromHsl.toHex());
console.log('  fromCmy', fromCmy.toHex());

// --- read back as any model ----------------------------------------------
const c = Color.fromHex('#3db0c4');
console.log('\n#3db0c4 in every model:');
console.log('  rgb', c.toRgb());
console.log('  hsv', c.toHsv());
console.log('  hsl', c.toHsl());
console.log('  cmy', c.toCmy(), '(× 255 for CMY fixtures)');
console.log('  luminance', c.luminance().toFixed(3), c.isLight() ? '(light)' : '(dark)');

// --- operations all return a new Color -----------------------------------
console.log('\noperations on red:');
console.log('  lighten(.2)  ', Color.RED.lighten(0.2).toHex());
console.log('  darken(.2)   ', Color.RED.darken(0.2).toHex());
console.log('  desaturate(.5)', Color.RED.desaturate(0.5).toHex());
console.log('  rotate(120)  ', Color.RED.rotate(120).toHex(), '(→ green)');
console.log('  complement   ', Color.RED.complement().toHex(), '(→ cyan)');
console.log('  scale(0.5)   ', Color.RED.scale(0.5).toHex(), '(dimmer)');
console.log('  mix blue 50% ', Color.RED.mix(Color.BLUE, 0.5).toHex());

// --- standalone functions (no object needed) -----------------------------
console.log('\nstandalone conversions:');
console.log('  hexToRgb     ', hexToRgb('#ff8000'));
console.log('  rgbToHex     ', rgbToHex({ r: 255, g: 128, b: 0 }));
console.log('  rgbToHsv     ', rgbToHsv({ r: 255, g: 128, b: 0 }));
console.log('  hsvToRgb     ', hsvToRgb({ h: 30, s: 1, v: 1 }));
console.log('  rgbToHsl     ', rgbToHsl({ r: 255, g: 128, b: 0 }));
console.log('  hslToRgb     ', hslToRgb({ h: 30, s: 1, l: 0.5 }));
console.log('  rgbToCmy     ', rgbToCmy({ r: 255, g: 128, b: 0 }));
console.log('  cmyToRgb     ', cmyToRgb({ c: 0, m: 0.5, y: 1 }));

// --- feed the engine: Color → setRGB-style tuple -------------------------
const [r, g, b] = Color.fromHex('#ff8000').scale(0.75).toArray();
console.log('\ndimmed orange as DMX bytes:', { r, g, b });
