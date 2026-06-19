// Fixture system entry — importing this file bootstraps the channel-type,
// capability, and importer registries with the built-ins.

// Channel types — each module self-registers via side effects
import './types/intensity';
import './types/color';
import './types/position';
import './types/beam';
import './types/prism';
import './types/gobo';
import './types/control';

// Importers — each module self-registers
import './importers/LumoxImporter';

export { ChannelType, ChannelTypeRegistry } from './ChannelType';
export {
  Capability, ColorCapability, GoboCapability, ShutterCapability,
  EffectCapability, CapabilityRegistry,
} from './Capability';
export { ChannelDefinition } from './ChannelDefinition';
export { FixtureMode } from './FixtureMode';
export { FixtureDefinition } from './FixtureDefinition';
export type { EmitterCell, FixtureDefinitionJSON } from './FixtureDefinition';
export { Fixture } from './Fixture';
export { FixtureLibrary } from './FixtureLibrary';
export { FixtureValidator } from './FixtureValidator';
export { FixtureImporter, ImporterRegistry } from './importers/Importer';
export { LumoxImporter } from './importers/LumoxImporter';
