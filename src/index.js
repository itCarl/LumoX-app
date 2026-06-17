// Public API — one import point for the rest of the app (main process + later renderer via IPC bridge).

export { Engine } from './core/Engine.js';
export { Universe, DMX_CHANNELS } from './core/Universe.js';
export { UniverseManager } from './core/UniverseManager.js';

export { Output } from './outputs/Output.js';
export { OutputManager } from './outputs/OutputManager.js';
export { ArtNetOutput } from './outputs/ArtNetOutput.js';
export { SacnOutput } from './outputs/SacnOutput.js';

// Mix engine
export { MixModule, blendHTP, blendLTP, scaleAll, scaleMasked, buffersEqual } from './mix/MixModule.js';
export { MixPipeline } from './mix/MixPipeline.js';
export { BaseLayer } from './mix/modules/BaseLayer.js';
export { SceneMixer } from './mix/modules/SceneMixer.js';
export { Effects, sineEffect, strobeEffect, chaseEffect } from './mix/modules/Effects.js';
export {
  GroupEffects,
  rainbowGroupEffect, chaseGroupEffect, flashGroupEffect, sineIntensityGroupEffect,
} from './mix/modules/GroupEffects.js';
export { GrandMaster } from './mix/modules/GrandMaster.js';
export { Blackout } from './mix/modules/Blackout.js';

// Fixtures (channel types, capabilities, definitions, modes, library, importers)
export * from './fixtures/index.js';

// MIDI
export * from './midi/index.js';

// Show
export { Show } from './show/Show.js';
export { Patch } from './show/Patch.js';
export { Scene } from './show/Scene.js';
export { Group } from './show/Group.js';
export { GroupManager } from './show/GroupManager.js';

export { createLogger, setLogLevel } from './util/logger.js';

// Register built-in output types so OutputManager.create('artnet'|'sacn', cfg) works.
import { OutputManager } from './outputs/OutputManager.js';
import { ArtNetOutput } from './outputs/ArtNetOutput.js';
import { SacnOutput } from './outputs/SacnOutput.js';
OutputManager.registerType(ArtNetOutput);
OutputManager.registerType(SacnOutput);
