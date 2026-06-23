import { ChannelDefinition } from './ChannelDefinition';
import type { ChannelJSON } from './ChannelDefinition';

/**
 * FixtureMode — ordered list of ChannelDefinitions for one operating mode
 * of a fixture (e.g. "8-channel", "16-channel extended").
 *
 *   channels[0]  → DMX address `startAddress + 0`
 *   channels[N]  → DMX address `startAddress + N`
 *
 * Use `null` entries for unused slots (rare; some profiles do this).
 */

/** JSON shape of a fixture mode (round-trips via `toJSON`/`fromJSON`). */
export interface ModeJSON {
  id?: string;
  name: string;
  channels?: (ChannelJSON | null)[];
  /** Emitter groups: each inner array is the 1-based channel indices (into this
   *  mode) forming one light cell. Roles (R/G/B/W, dimmer) are detected from the
   *  grouped channels' types. Absent → emitters are auto-derived from colour
   *  clusters (the zero-config default). */
  emitters?: number[][];
}

/** Options bag accepted by the `FixtureMode` constructor. */
export interface FixtureModeOptions {
  id?: string;
  name: string;
  channels?: (ChannelDefinition | ChannelJSON | null)[];
  emitters?: number[][];
}

export class FixtureMode {
  id: string;
  name: string;
  channels: (ChannelDefinition | null)[];
  /** Optional explicit emitter groups (1-based channel indices). See `ModeJSON`. */
  emitters?: number[][];

  constructor({ id, name, channels = [], emitters }: FixtureModeOptions) {
    this.id = id ?? name;
    this.name = name;
    this.channels = channels.map((c) => (c instanceof ChannelDefinition ? c : ChannelDefinition.fromJSON(c as ChannelJSON)));
    this.emitters = sanitizeEmitters(emitters, this.channels.length);
  }

  get channelCount(): number { return this.channels.length; }

  /** Find index (1-based fixture-local) by channel type id. Returns 0 if missing. */
  indexOfType(typeId: string): number {
    const i = this.channels.findIndex((c) => c?.typeId === typeId);
    return i < 0 ? 0 : i + 1;
  }

  /** All channel indices (1-based) matching predicate. */
  indicesWhere(pred: (c: ChannelDefinition) => boolean): number[] {
    const out: number[] = [];
    this.channels.forEach((c, i) => { if (c && pred(c)) out.push(i + 1); });
    return out;
  }

  toJSON(): ModeJSON {
    return {
      id: this.id,
      name: this.name,
      channels: this.channels.map((c) => c?.toJSON() ?? null),
      ...(this.emitters?.length ? { emitters: this.emitters.map((g) => [...g]) } : {}),
    };
  }

  static fromJSON(obj: FixtureModeOptions): FixtureMode { return new FixtureMode(obj); }
}

/** Coerce raw emitter groups to valid 1-based index lists: keep integers in
 *  `1..channelCount` (deduped, order preserved), drop empty groups. Returns
 *  undefined when nothing valid remains, so a mode without explicit emitters
 *  falls back to auto-derivation. */
function sanitizeEmitters(raw: unknown, channelCount: number): number[][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const groups: number[][] = [];
  for (const g of raw) {
    if (!Array.isArray(g)) continue;
    const seen = new Set<number>();
    const idxs = g.filter((n): n is number =>
      Number.isInteger(n) && n >= 1 && n <= channelCount && !seen.has(n) && (seen.add(n), true));
    if (idxs.length) groups.push(idxs);
  }
  return groups.length ? groups : undefined;
}
