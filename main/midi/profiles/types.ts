// MIDI device profiles — the plugin seam that makes new controllers easy to add.
//
// Everything device-specific lives behind `MidiDeviceProfile`: how to recognise
// the port, which LED colours/animations the pads support, and how to encode an
// LED state into a MIDI message. `MidiService` and the mapping UI are written
// against this interface only, so adding a controller = drop one module in
// `profiles/` and list it in `profiles/index.ts` — no other code changes.
//
// Input is already device-agnostic (every backend normalises to note/cc), so a
// profile only needs to describe *output* (LED feedback) + identity. A device
// with no LEDs (or an unknown one) uses the generic profile and still works for
// input bindings.

export type LedMode = 'solid' | 'blink' | 'fade';

/** The desired state of one pad LED, resolved from a binding + live show state. */
export interface LedState {
  colorName: string;     // a name from this profile's palette
  mode: LedMode;         // animation while the target is active
  active: boolean;       // is the bound target currently on?
}

/** A concrete MIDI message a profile emits to drive one pad LED. */
export interface LedCommand {
  note: number;
  velocity: number;
  channel: number;
}

/** One selectable LED colour — `name` is persisted, `hex` is the UI swatch. */
export interface MidiPaletteColor {
  name: string;
  hex: string;
}

/** A pluggable controller definition. */
export interface MidiDeviceProfile {
  /** stable id (persisted with bindings' device hints if ever needed) */
  id: string;
  /** human name shown in the MIDI window status */
  name: string;
  /** case-insensitive substring matched against MIDI port names */
  portHint: string;
  /** optional custom port matcher (overrides `portHint`) */
  matches?(portName: string): boolean;
  /** colours the pads can show (empty = device has no addressable LEDs) */
  palette: MidiPaletteColor[];
  /** active-state animations the device supports (empty = no LED feedback) */
  ledModes: LedMode[];
  /** encode a pad LED state into a MIDI message, or null for "no LED". */
  led(note: number, state: LedState): LedCommand | null;
}

/** What the renderer needs to render device-appropriate LED controls. */
export interface MidiCapabilities {
  deviceId: string | null;
  palette: MidiPaletteColor[];
  ledModes: LedMode[];
}
