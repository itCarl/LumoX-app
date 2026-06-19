// Device profile — AKAI APC Mini MK2 (8×8 RGB pad grid + side/track buttons).
//
// LEDs: a Note On's *velocity* picks the colour from a fixed 0..127 palette; the
// Note On's *MIDI channel* selects the behaviour:
//   0..6 = solid 10/25/50/65/75/90/100%   (we use 6 = 100% for "on", 2 = 50% idle)
//   7..10 = pulse  1/16, 1/8, 1/4, 1/2     (we use 9 = pulse 1/4 for "fade")
//   11..15 = blink 1/24,1/16,1/8,1/4,1/2   (we use 13 = blink 1/8 for "blink")
// (Akai APC mini mk2 Communications Protocol v1.0.)

import { ApcMiniMk2 } from '../../../src/index';
import type { MidiDeviceProfile, LedMode } from './types';

const C = ApcMiniMk2.COLOR;

// name → { swatch hex (UI), velocity (device colour index) }
const PALETTE = [
  { name: 'red',    hex: '#e0564b', vel: C.red },
  { name: 'orange', hex: '#e08a3b', vel: C.orange },
  { name: 'yellow', hex: '#e0c44b', vel: C.yellow },
  { name: 'green',  hex: '#4bc46a', vel: C.green },
  { name: 'cyan',   hex: '#3db0c4', vel: C.cyan },
  { name: 'blue',   hex: '#4b7ce0', vel: C.blue },
  { name: 'purple', hex: '#9c5be0', vel: C.purple },
  { name: 'pink',   hex: '#e34b8a', vel: C.pink },
  { name: 'white',  hex: '#e8e8e8', vel: C.white },
];

// MIDI channel per behaviour (see header).
const CH: Record<LedMode | 'dim', number> = { solid: 6, fade: 9, blink: 13, dim: 2 };

export const apcMiniMk2Profile: MidiDeviceProfile = {
  id: 'apc-mini-mk2',
  name: 'AKAI APC Mini MK2',
  portHint: ApcMiniMk2.DEFAULT_PORT_HINT,
  palette: PALETTE.map((p) => ({ name: p.name, hex: p.hex })),
  ledModes: ['solid', 'blink', 'fade'],
  led(note, { colorName, mode, active }) {
    const c = PALETTE.find((p) => p.name === colorName) ?? PALETTE.find((p) => p.name === 'cyan')!;
    if (!c.vel) return { note, velocity: 0, channel: 0 };   // unknown / "off" → dark pad
    return { note, velocity: c.vel, channel: active ? CH[mode] : CH.dim };
  },
};
