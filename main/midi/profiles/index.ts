// Device-profile registry. To add a controller: write a `MidiDeviceProfile`
// module in this folder and add it to PROFILES, *before* the generic fallback.
// Order matters — the first profile that matches an available port wins.

import { apcMiniMk2Profile } from './apcMiniMk2';
import { genericProfile } from './generic';
import type { MidiDeviceProfile } from './types';

export const PROFILES: MidiDeviceProfile[] = [
  apcMiniMk2Profile,
  // ...add more specific device profiles here...
  genericProfile,   // fallback — keep last (matches anything)
];

const portMatches = (p: MidiDeviceProfile, name: string): boolean =>
  p.matches ? p.matches(name) : (!!p.portHint && name.toLowerCase().includes(p.portHint.toLowerCase()));

/** Pick the best (profile, input port) for the available inputs, or null if none. */
export function selectDevice(inputs: string[]): { profile: MidiDeviceProfile; portName: string } | null {
  for (const profile of PROFILES) {
    const portName = inputs.find((name) => portMatches(profile, name));
    if (portName != null) return { profile, portName };
  }
  return null;
}

export * from './types';
