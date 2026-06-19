import { ChannelType, ChannelTypeRegistry as R } from '../ChannelType';
import type { ChannelTypeOptions } from '../ChannelType';

// Colour-mixing emitters — coarse + 16-bit fine counterpart. `isColor` + a hex
// hint drives the colour UI.
const C = (id: string, name: string, color: string, extras: Partial<ChannelTypeOptions> = {}): ChannelType => R.register(new ChannelType({
  id, name, group: 'color', isColor: true, color, ...extras,
}));

C('red',     'Red',     '#ff0000');   C('red-fine',     'Red Fine',     '#ff0000', { fineOf: 'red' });
C('green',   'Green',   '#00ff00');   C('green-fine',   'Green Fine',   '#00ff00', { fineOf: 'green' });
C('blue',    'Blue',    '#0000ff');   C('blue-fine',    'Blue Fine',    '#0000ff', { fineOf: 'blue' });
C('white',   'White',   '#ffffff');   C('white-fine',   'White Fine',   '#ffffff', { fineOf: 'white' });
C('amber',   'Amber',   '#ffbf00');   C('amber-fine',   'Amber Fine',   '#ffbf00', { fineOf: 'amber' });
C('uv',      'UV',      '#6b00ff');   C('uv-fine',      'UV Fine',      '#6b00ff', { fineOf: 'uv' });
C('lime',    'Lime',    '#bfff00');   C('lime-fine',    'Lime Fine',    '#bfff00', { fineOf: 'lime' });
C('indigo',  'Indigo',  '#4b0082');   C('indigo-fine',  'Indigo Fine',  '#4b0082', { fineOf: 'indigo' });
C('cyan',    'Cyan',    '#00ffff');   C('cyan-fine',    'Cyan Fine',    '#00ffff', { fineOf: 'cyan' });
C('magenta', 'Magenta', '#ff00ff');   C('magenta-fine', 'Magenta Fine', '#ff00ff', { fineOf: 'magenta' });
C('yellow',  'Yellow',  '#ffff00');   C('yellow-fine',  'Yellow Fine',  '#ffff00', { fineOf: 'yellow' });

// Colour wheel / macro — indexed positions, not mixable, so no fixed swatch.
R.register(new ChannelType({ id: 'color-wheel',      name: 'Color Wheel',      group: 'color' }));
R.register(new ChannelType({ id: 'color-wheel-fine', name: 'Color Wheel Fine', group: 'color', fineOf: 'color-wheel' }));
R.register(new ChannelType({ id: 'color-macro',      name: 'Color Macro',      group: 'color' }));

// Colour-temperature correction + mixer control channels.
R.register(new ChannelType({ id: 'cto',             name: 'CTO',       group: 'color' }));
R.register(new ChannelType({ id: 'ctb',             name: 'CTB',       group: 'color' }));
R.register(new ChannelType({ id: 'color-rgb-mixer', name: 'RGB Mixer', group: 'color' }));
R.register(new ChannelType({ id: 'cto-mixer',       name: 'CTO Mixer', group: 'color' }));
R.register(new ChannelType({ id: 'ctc-mixer',       name: 'CTC Mixer', group: 'color' }));
R.register(new ChannelType({ id: 'ctb-mixer',       name: 'CTB Mixer', group: 'color' }));

// HSV / HSL colour-space controls — single faders, not fixed swatches (no `isColor`).
const H = (id: string, name: string, extras: Partial<ChannelTypeOptions> = {}): ChannelType =>
  R.register(new ChannelType({ id, name, group: 'color', ...extras }));
H('hue',        'Hue');          H('hue-fine',        'Hue Fine',        { fineOf: 'hue' });
H('saturation', 'Saturation');   H('saturation-fine', 'Saturation Fine', { fineOf: 'saturation' });
H('lightness',  'Lightness');    H('lightness-fine',  'Lightness Fine',  { fineOf: 'lightness' });
H('value',      'Value');        H('value-fine',      'Value Fine',      { fineOf: 'value' });
