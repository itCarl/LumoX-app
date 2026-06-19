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
}

/** Options bag accepted by the `FixtureMode` constructor. */
export interface FixtureModeOptions {
  id?: string;
  name: string;
  channels?: (ChannelDefinition | ChannelJSON | null)[];
}

export class FixtureMode {
  id: string;
  name: string;
  channels: (ChannelDefinition | null)[];

  constructor({ id, name, channels = [] }: FixtureModeOptions) {
    this.id = id ?? name;
    this.name = name;
    this.channels = channels.map((c) => (c instanceof ChannelDefinition ? c : ChannelDefinition.fromJSON(c as ChannelJSON)));
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
    };
  }

  static fromJSON(obj: FixtureModeOptions): FixtureMode { return new FixtureMode(obj); }
}
