import { ChannelDefinition } from './ChannelDefinition.js';

/**
 * FixtureMode — ordered list of ChannelDefinitions for one operating mode
 * of a fixture (e.g. "8-channel", "16-channel extended").
 *
 *   channels[0]  → DMX address `startAddress + 0`
 *   channels[N]  → DMX address `startAddress + N`
 *
 * Use `null` entries for unused slots (rare; some QLC+ profiles do this).
 */
export class FixtureMode {
  constructor({ id, name, channels = [] }) {
    this.id = id ?? name;
    this.name = name;
    this.channels = channels.map((c) => (c instanceof ChannelDefinition ? c : ChannelDefinition.fromJSON(c)));
  }

  get channelCount() { return this.channels.length; }

  /** Find index (1-based fixture-local) by channel type id. Returns 0 if missing. */
  indexOfType(typeId) {
    const i = this.channels.findIndex((c) => c?.typeId === typeId);
    return i < 0 ? 0 : i + 1;
  }

  /** All channel indices (1-based) matching predicate. */
  indicesWhere(pred) {
    const out = [];
    this.channels.forEach((c, i) => { if (c && pred(c)) out.push(i + 1); });
    return out;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      channels: this.channels.map((c) => c?.toJSON() ?? null),
    };
  }

  static fromJSON(obj) { return new FixtureMode(obj); }
}
