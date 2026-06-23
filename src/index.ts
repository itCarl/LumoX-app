// Public API — one import point for the rest of the app (main process + later renderer via IPC bridge).

export { Engine } from './core/Engine';
export { Universe, DMX_CHANNELS, VIRTUAL_CHANNELS, TOTAL_CHANNELS } from './core/Universe';
export { UniverseManager } from './core/UniverseManager';

export { Output } from './outputs/Output';
export type { OutputConfig, FrameMode } from './outputs/Output';
export { OutputManager } from './outputs/OutputManager';
export { ArtNetOutput } from './outputs/ArtNetOutput';
export { SacnOutput } from './outputs/SacnOutput';

// Discovery — find Art-Net nodes on the network (ArtPoll / ArtPollReply)
export { DiscoveryService } from './discovery/index';
export type { DiscoveredDevice, DiscoveryStatus, DiscoveryOptions } from './discovery/index';

// Mix engine
export { MixModule, blendHTP, blendLTP, scaleAll, scaleMasked, buffersEqual } from './mix/MixModule';
export { MixPipeline } from './mix/MixPipeline';
export { BaseLayer } from './mix/modules/BaseLayer';
export { SceneMixer } from './mix/modules/SceneMixer';
export { renderColorFx, renderMoveFx, renderWaveFx, renderChaserFx } from './mix/sceneFx';
export { Effects, sineEffect, strobeEffect, chaseEffect } from './mix/modules/Effects';
export {
  GroupEffects,
  rainbowGroupEffect, chaseGroupEffect, flashGroupEffect, sineIntensityGroupEffect,
} from './mix/modules/GroupEffects';
export { GrandMaster } from './mix/modules/GrandMaster';
export { Limits } from './mix/modules/Limits';
export type { FixtureLimitTargets, AxisLimitTarget, LimitMap } from './mix/modules/Limits';
export { VirtualDimmer } from './mix/modules/VirtualDimmer';
export type { VirtualCluster, VirtualDimmerMap } from './mix/modules/VirtualDimmer';
export { Blackout } from './mix/modules/Blackout';

// Fixtures (channel types, capabilities, definitions, modes, library, importers)
export * from './fixtures/index';

// MIDI
export * from './midi/index';

// Show
export { Show } from './show/Show';
export type { SavedSelection } from './show/Show';
export { Patch } from './show/Patch';
export {
  Scene, chaseStep, toChaseStep, DEFAULT_STEP_WAIT,
  DEFAULT_COLOR_FX, DEFAULT_MOVE_FX, DEFAULT_CURVE_FX, DEFAULT_CHASER_FX, DEFAULT_VALUE_FX,
  defaultFxLayer, normalizeLayer,
} from './show/Scene';
export type {
  SceneType, SceneValues, ChaseStep,
  ColorFxConfig, MoveFxConfig, CurveFxConfig, ChaserFxConfig, ValueFxConfig, FxFeature,
  MoveShape, CurveWave,
  FxKind, FxTargetSel, FxOrder, FxLayer, TrackLayer, MixerTrack,
} from './show/Scene';
export { Group } from './show/Group';
export { GroupManager } from './show/GroupManager';
export { BankManager } from './show/BankManager';
export type { Bank, BankJSON } from './show/BankManager';

export { createLogger, setLogLevel } from './util/logger';

// Colour — DMX-byte bridges over culori (the colour-maths library). For richer
// colour work (model conversions, perceptual blending) import culori directly.
export { hsvToBytes, hexToBytes } from './util/color';
export type { Rgb } from './util/color';

// Register built-in output types so OutputManager.create('artnet'|'sacn', cfg) works.
import { OutputManager } from './outputs/OutputManager';
import { ArtNetOutput } from './outputs/ArtNetOutput';
import { SacnOutput } from './outputs/SacnOutput';
OutputManager.registerType(ArtNetOutput);
OutputManager.registerType(SacnOutput);
