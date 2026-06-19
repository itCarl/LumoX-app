// The single MIDI backend for the whole app. Both MIDI consumers — the control
// surface (`MidiService`) and the tempo clock (`Transport`'s `MidiClockSource`) —
// use this one `MidiManager`, so there is exactly one backend, one port
// enumeration, and one MIDI clock source. Never construct another MidiManager in
// the main process; import this instead.

import { MidiManager } from '../../src/index';

export const midiManager = new MidiManager();
