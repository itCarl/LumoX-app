import { ChannelTypeRegistry } from './ChannelType.js';
import { CapabilityRegistry, Capability } from './Capability.js';

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
export class ChannelDefinition {
  constructor({ name, typeId, defaultValue = null, capabilities = [] }) {
    if (!typeId) throw new Error('ChannelDefinition needs typeId');
    if (!ChannelTypeRegistry.has(typeId)) {
      throw new Error(`Unknown channel type: ${typeId}`);
    }
    this.name = name ?? ChannelTypeRegistry.get(typeId).name;
    this.typeId = typeId;
    this.defaultValue = (defaultValue ?? ChannelTypeRegistry.get(typeId).defaultValue) & 0xff;
    this.capabilities = capabilities.map((c) => (c instanceof Capability ? c : CapabilityRegistry.fromJSON(c)));
  }

  get type() { return ChannelTypeRegistry.get(this.typeId); }

  /** First capability whose range contains `value`, or null. */
  capabilityAt(value) {
    return this.capabilities.find((c) => c.matches(value)) ?? null;
  }

  toJSON() {
    return {
      name: this.name,
      typeId: this.typeId,
      defaultValue: this.defaultValue,
      capabilities: this.capabilities.map((c) => c.toJSON()),
    };
  }

  static fromJSON(obj) { return new ChannelDefinition(obj); }
}
