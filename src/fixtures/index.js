// Fixture system entry — importing this file bootstraps the channel-type,
// capability, and importer registries with the built-ins.

// Channel types — each module self-registers via side effects
import './types/intensity.js';
import './types/color.js';
import './types/position.js';
import './types/beam.js';
import './types/gobo.js';
import './types/control.js';

// Importers — each module self-registers
import './importers/LumoxImporter.js';
import './importers/QlcPlusImporter.js';

export { ChannelType, ChannelTypeRegistry } from './ChannelType.js';
export {
  Capability, ColorCapability, GoboCapability, ShutterCapability,
  EffectCapability, CapabilityRegistry,
} from './Capability.js';
export { ChannelDefinition } from './ChannelDefinition.js';
export { FixtureMode } from './FixtureMode.js';
export { FixtureDefinition } from './FixtureDefinition.js';
export { Fixture } from './Fixture.js';
export { FixtureLibrary } from './FixtureLibrary.js';
export { FixtureValidator } from './FixtureValidator.js';
export { FixtureImporter, ImporterRegistry } from './importers/Importer.js';
export { LumoxImporter } from './importers/LumoxImporter.js';
export { QlcPlusImporter } from './importers/QlcPlusImporter.js';
