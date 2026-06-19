// Device profile — generic fallback. Matches ANY MIDI input so an unknown
// controller still works for input bindings (assign a pad/fader to any Lumox
// function); it just has no LED feedback. Always last in the registry, so a
// specific profile (e.g. the APC) wins when its device is present.

import type { MidiDeviceProfile } from './types';

export const genericProfile: MidiDeviceProfile = {
  id: 'generic',
  name: 'Generic MIDI device',
  portHint: '',
  matches: () => true,
  palette: [],
  ledModes: [],
  led: () => null,
};
