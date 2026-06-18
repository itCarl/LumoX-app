// Public API — one import point for the rest of the app (main process + later renderer via IPC bridge).

export { Engine } from './core/Engine';
export { Universe, DMX_CHANNELS } from './core/Universe';
export { UniverseManager } from './core/UniverseManager';

export { Output } from './outputs/Output';
export { OutputManager } from './outputs/OutputManager';
export { ArtNetOutput } from './outputs/ArtNetOutput';
export { SacnOutput } from './outputs/SacnOutput';

// Mix engine
export { MixModule, blendHTP, blendLTP, scaleAll, scaleMasked, buffersEqual } from './mix/MixModule';
export { MixPipeline } from './mix/MixPipeline';
export { BaseLayer } from './mix/modules/BaseLayer';
export { SceneMixer } from './mix/modules/SceneMixer';
export { Effects, sineEffect, strobeEffect, chaseEffect } from './mix/modules/Effects';
export {
  GroupEffects,
  rainbowGroupEffect, chaseGroupEffect, flashGroupEffect, sineIntensityGroupEffect,
} from './mix/modules/GroupEffects';
export { GrandMaster } from './mix/modules/GrandMaster';
export { Blackout } from './mix/modules/Blackout';

// Fixtures (channel types, capabilities, definitions, modes, library, importers)
export * from './fixtures/index';

// MIDI
export * from './midi/index';

// Show
export { Show } from './show/Show';
export { Patch } from './show/Patch';
export { Scene } from './show/Scene';
export { Group } from './show/Group';
export { GroupManager } from './show/GroupManager';
export { BankManager } from './show/BankManager';
export type { Bank, BankJSON } from './show/BankManager';

export { createLogger, setLogLevel } from './util/logger';

// Register built-in output types so OutputManager.create('artnet'|'sacn', cfg) works.
import { OutputManager } from './outputs/OutputManager';
import { ArtNetOutput } from './outputs/ArtNetOutput';
import { SacnOutput } from './outputs/SacnOutput';
OutputManager.registerType(ArtNetOutput);
OutputManager.registerType(SacnOutput);
