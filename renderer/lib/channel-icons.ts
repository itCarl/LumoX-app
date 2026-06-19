// Channel-type icons — maps a DMX channel type to a recognisable symbol so the
// UI can show a glyph per channel (fader editor columns, fixture editor rows).
// Keyed by channel-type id with a per-group fallback; `-fine` 16-bit variants
// reuse their coarse counterpart's glyph.
//
// Glyphs come from the vendored Font Awesome free set (see build.mjs) — the
// icon system already used across the renderer, so no bespoke SVGs. The
// channel-type taxonomy and symbol picks take inspiration from the open-source
// QLC+ fixture editor's capability presets.

const DEFAULT = 'fa-solid fa-circle-question';

// Per channel-type group — fallback when an id has no explicit entry.
export const GROUP_ICONS: Record<string, string> = {
  intensity:   'fa-solid fa-sun',
  color:       'fa-solid fa-palette',
  position:    'fa-solid fa-up-down-left-right',
  gobo:        'fa-solid fa-image',
  beam:        'fa-solid fa-bullseye',
  prism:       'fa-solid fa-gem',
  control:     'fa-solid fa-sliders',
  maintenance: 'fa-solid fa-wrench',
  effect:      'fa-solid fa-wand-magic-sparkles',
};

// Per channel-type id (coarse ids; `-fine` variants resolve to these).
const TYPE_ICONS: Record<string, string> = {
  // intensity
  'intensity-master': 'fa-solid fa-sun',
  intensity:          'fa-solid fa-lightbulb',
  shutter:            'fa-solid fa-circle-half-stroke',
  strobe:             'fa-solid fa-bolt',
  'dimmer-curve':     'fa-solid fa-chart-line',

  // colour — mixing emitters render as a tinted dot (see channelIconHtml)
  red:     'fa-solid fa-circle', green:   'fa-solid fa-circle', blue:    'fa-solid fa-circle',
  white:   'fa-solid fa-circle', amber:   'fa-solid fa-circle', uv:      'fa-solid fa-circle',
  lime:    'fa-solid fa-circle', indigo:  'fa-solid fa-circle', cyan:    'fa-solid fa-circle',
  magenta: 'fa-solid fa-circle', yellow:  'fa-solid fa-circle',
  'color-wheel': 'fa-solid fa-palette',
  'color-macro': 'fa-solid fa-swatchbook',
  cto: 'fa-solid fa-temperature-high', ctb: 'fa-solid fa-temperature-low',
  'color-rgb-mixer': 'fa-solid fa-fill-drip',
  'cto-mixer': 'fa-solid fa-temperature-high',
  'ctc-mixer': 'fa-solid fa-temperature-half',
  'ctb-mixer': 'fa-solid fa-temperature-low',
  hue:       'fa-solid fa-palette',  saturation: 'fa-solid fa-droplet',
  lightness: 'fa-solid fa-sun',      value:      'fa-solid fa-circle-half-stroke',

  // position
  pan:      'fa-solid fa-arrows-left-right', tilt:     'fa-solid fa-arrows-up-down',
  'x-axis': 'fa-solid fa-arrows-left-right', 'y-axis': 'fa-solid fa-arrows-up-down',
  'pan-tilt-speed':           'fa-solid fa-gauge-high',
  'pan-speed-slow-fast':      'fa-solid fa-gauge-high', 'pan-speed-fast-slow':      'fa-solid fa-gauge-high',
  'tilt-speed-slow-fast':     'fa-solid fa-gauge-high', 'tilt-speed-fast-slow':     'fa-solid fa-gauge-high',
  'pan-tilt-speed-slow-fast': 'fa-solid fa-gauge-high', 'pan-tilt-speed-fast-slow': 'fa-solid fa-gauge-high',

  // beam
  zoom:  'fa-solid fa-magnifying-glass', focus: 'fa-solid fa-crosshairs',
  iris:  'fa-solid fa-circle-dot',       frost: 'fa-solid fa-snowflake',
  'blade-1': 'fa-solid fa-scissors',     'blade-2': 'fa-solid fa-scissors',

  // prism
  prism:                      'fa-solid fa-gem',
  'prism-rotation':           'fa-solid fa-arrows-rotate',
  'prism-rotation-slow-fast': 'fa-solid fa-arrows-rotate',
  'prism-rotation-fast-slow': 'fa-solid fa-arrows-rotate',

  // gobo
  'gobo-wheel-1':    'fa-solid fa-image',         'gobo-wheel-2': 'fa-solid fa-image',
  'gobo-index':      'fa-solid fa-image',
  'gobo-rotation-1': 'fa-solid fa-arrows-rotate', 'gobo-rotation-2': 'fa-solid fa-arrows-rotate',
  'gobo-shake':      'fa-solid fa-arrow-right-arrow-left',

  // control / maintenance / effect
  speed:    'fa-solid fa-gauge-high', sound:    'fa-solid fa-music',
  macro:    'fa-solid fa-gears',      function: 'fa-solid fa-gear',
  reset:    'fa-solid fa-rotate-left', lamp:    'fa-solid fa-power-off', fan: 'fa-solid fa-fan',
  effect:   'fa-solid fa-wand-magic-sparkles', 'effect-speed': 'fa-solid fa-gauge-high',
  nothing:  'fa-solid fa-ban',
};

/** Font Awesome class for a channel type; `-fine` reuses its coarse glyph. */
export function channelIcon(typeId?: string | null, group?: string | null): string {
  if (typeId) {
    const hit = TYPE_ICONS[typeId] ?? TYPE_ICONS[typeId.replace(/-fine$/, '')];
    if (hit) return hit;
  }
  return (group && GROUP_ICONS[group]) || DEFAULT;
}

/** `<i>` markup for a channel type. Colour emitters are tinted with `color`. */
export function channelIconHtml(typeId?: string | null, group?: string | null, color?: string | null): string {
  const cls = channelIcon(typeId, group);
  const tint = color && /^#[0-9a-fA-F]{3,8}$/.test(color) ? ` style="color:${color}"` : '';
  return `<i class="${cls}"${tint}></i>`;
}
