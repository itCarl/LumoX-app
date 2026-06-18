import { ChannelTypeRegistry, ChannelType } from './ChannelType';
import { CapabilityRegistry, Capability } from './Capability';
import type { CapabilityJSON } from './Capability';

/**
 * ChannelDefinition — one channel inside a FixtureMode.
 *
 *   name           free label ("Red", "Pan Fine", "Gobo Wheel")
 *   typeId         id from ChannelTypeRegistry ('red', 'pan-fine', 'gobo-wheel-1')
 *   defaultValue   power-on value (0-255)
 *   capabilities   ordered array of Capability instances
 *
 * The same ChannelDefinition instance may appear in multiple modes (cheap
 * sharing). Treat as immutable after construction.
 */

/** JSON shape of a channel definition (round-trips via `toJSON`/`fromJSON`). */
export interface ChannelJSON {
  name?: string | null;
  typeId: string;
  defaultValue?: number | null;
  capabilities?: CapabilityJSON[];
}

/** Options bag accepted by the `ChannelDefinition` constructor. */
export interface ChannelDefinitionOptions {
  name?: string | null;
  typeId: string;
  defaultValue?: number | null;
  capabilities?: (Capability | CapabilityJSON)[];
}

export class ChannelDefinition {
  name: string;
  typeId: string;
  defaultValue: number;
  capabilities: Capability[];

  constructor({ name, typeId, defaultValue = null, capabilities = [] }: ChannelDefinitionOptions) {
    if (!typeId) throw new Error('ChannelDefinition needs typeId');
    if (!ChannelTypeRegistry.has(typeId)) {
      throw new Error(`Unknown channel type: ${typeId}`);
    }
    this.name = name ?? ChannelTypeRegistry.get(typeId)!.name;
    this.typeId = typeId;
    this.defaultValue = (defaultValue ?? ChannelTypeRegistry.get(typeId)!.defaultValue) & 0xff;
    this.capabilities = capabilities.map((c) => (c instanceof Capability ? c : CapabilityRegistry.fromJSON(c)));
  }

  get type(): ChannelType | undefined { return ChannelTypeRegistry.get(this.typeId); }

  /** First capability whose range contains `value`, or null. */
  capabilityAt(value: number): Capability | null {
    return this.capabilities.find((c) => c.matches(value)) ?? null;
  }

  toJSON(): ChannelJSON {
    return {
      name: this.name,
      typeId: this.typeId,
      defaultValue: this.defaultValue,
      capabilities: this.capabilities.map((c) => c.toJSON()),
    };
  }

  static fromJSON(obj: ChannelDefinitionOptions): ChannelDefinition { return new ChannelDefinition(obj); }
}
