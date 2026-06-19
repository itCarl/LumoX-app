// DTOs — the plain-JSON shapes the engine objects are mapped to before crossing
// the IPC boundary into the renderer. These are the contract `window.lumox.*`
// consumes; the mappers live in `serializers.ts`. Keeping the shapes here (one
// place) makes the boundary explicit and lets both sides share the types.

export interface ModeDTO {
  id: string;
  name: string;
  channelCount: number;
}

/** Normalized 0..1 position of one emitter cell within the fixture. */
export interface EmitterCellDTO {
  x: number;
  y: number;
}

/** A fixture's 2D top-down placement on the STAGE (world units + degrees). */
export interface StageTransformDTO {
  x: number;
  y: number;
  rotation: number;
}

/** Per-fixture output limits (coarse DMX 0..255). Mirrors engine `FixtureLimits`. */
export interface FixtureLimitsDTO {
  dimmer?: { max: number };
  pan?:  { min: number; max: number; invert?: boolean };
  tilt?: { min: number; max: number; invert?: boolean };
  swapPanTilt?: boolean;
}

/** Per-channel flags by 1-based local index. Mirrors engine `FixtureChannelFlags`. */
export type FixtureChannelFlagsDTO = { [channelIndex: number]: { fade?: boolean; dimmer?: boolean } };

export interface DefDTO {
  id: string;
  manufacturer: string;
  model: string;
  type: string;
  emitters: number;
  emitterLayout: EmitterCellDTO[] | null;
  source: string;
  modes: ModeDTO[];
}

export interface ChannelDTO {
  index: number;
  name: string;
  typeId: string | null;
  group: string | null;
  color: string | null;
}

export interface FixtureDTO {
  id: string;
  name: string;
  color: string;
  definitionId: string;
  model: string;
  type: string;
  emitters: number;
  emitterLayout: EmitterCellDTO[] | null;
  modeId: string;
  modeName: string;
  configKey: string;
  groupId: string | null;
  groupName: string | null;
  universeId: number;
  startAddress: number;
  endAddress: number;
  channelCount: number;
  channels: ChannelDTO[];
  /** 2D top-down placement on the STAGE tile (world units + degrees). */
  transform: StageTransformDTO;
  /** Per-fixture output limits, or null when unconstrained. */
  limits: FixtureLimitsDTO | null;
  /** Per-channel behaviour flags, or null when none set. */
  channelFlags: FixtureChannelFlagsDTO | null;
}

export interface GroupDTO {
  id: string;
  name: string;
  color: string;
  configKey: string | null;
  fixtureIds: string[];
}

export type FxKindDTO = 'color' | 'move' | 'curve' | 'chaser' | 'value' | 'matrix';
export type FxOrderDTO = 'patch' | 'reverse' | 'mirror' | 'random';
export type FxWaveDTO = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'random';
export type MatrixPatternDTO = 'wipe' | 'radial' | 'plasma';
export type FxTargetSelDTO = { mode: 'all' } | { mode: 'group'; groupId: string } | { mode: 'selection' };

/** One effect layer in a scene's FX rack. The config matching `kind` is set. */
export interface FxLayerDTO {
  id: string;
  kind: FxKindDTO;
  enabled: boolean;
  target: FxTargetSelDTO;
  order: FxOrderDTO;
  rateMs: number;
  speed: number;
  driveMode: 'off' | 'bpm';
  beatDiv: number;
  direction: 'forward' | 'backward' | 'bounce';
  size: number;
  spread: number;
  /** number of fixtures this layer drives (target beams) — for the preview */
  beams: number;
  color?: { palette: string[]; grayscale: boolean; colorWidth: number; angle: number; saturation: number; fade: number; randomize: boolean };
  move?: { shape: 'circle' | 'figure8' | 'line' | 'square'; symmetry: boolean; sizeX: number; sizeY: number; centerX: number; centerY: number; phaseShape: number };
  curve?: { waveform: FxWaveDTO; attr: string; min: number; max: number; duty: number; invert: boolean };
  chaser?: { attr: string; litCount: number; gap: number; fade: number; level: number; bg: number };
  value?: { attr: string; waveform: FxWaveDTO; min: number; max: number; duty: number; invert: boolean; staticValue: number | null };
  matrix?: { pattern: MatrixPatternDTO; palette: string[]; saturation: number; fade: number; angle: number; scale: number };
}

export interface SceneDTO {
  id: string;
  name: string;
  color: string;
  opacity: number;
  active: boolean;
  /** base look — a fixed capture ('static') or a step list ('chase') */
  type: 'static' | 'chase';
  /** chase: number of captured steps */
  stepCount: number;
  /** chase: per-step timing (ms), in play order */
  steps: { fadeMs: number; waitMs: number }[];
  /** FX rack — ordered effect layers over the base look */
  layers: FxLayerDTO[];
  // ---- Scene Properties panel ----
  /** DIMMER master (0..1) */
  level: number;
  /** SPEED multiplier on the free-run period (chase base) */
  speed: number;
  /** fade in / out, seconds */
  fadeIn: number;
  fadeOut: number;
  /** multiplier on this scene's fade times */
  fadeSpeed: number;
  /** pre-delay before fade in / out begins, ms */
  phaseIn: number;
  phaseOut: number;
  driveMode: 'off' | 'bpm';
  beatDiv: number;
  startMode: 'restart' | 'continue' | 'random';
  direction: 'forward' | 'backward' | 'bounce';
  /** runtime: playhead paused */
  paused: boolean;
  /** runtime: real-time cycle length (ms) — chase walk / FX layer period; 0 = not periodic */
  cycleMs: number;
  /** runtime: current phase-clock position (ms) within the cycle */
  phaseMs: number;
  // ---- Advanced panel ----
  /** blend priority tier (higher overrides lower on shared channels) */
  priority: 'low' | 'normal' | 'high';
  /** loop termination — forever, or stop after N cycles */
  loop: { mode: 'always' | 'count'; count: number };
  /** counted-loop end action (null = stop per `releaseAtEnd`) */
  jumpTo: { mode: 'next' | 'prev' | 'scene'; sceneId?: string } | null;
  /** at the end of a counted loop: release (true) or pause (false) */
  releaseAtEnd: boolean;
  /** which other scenes this recall releases */
  releaseMode: 'off' | 'all' | 'bank' | 'outside-bank' | 'specific';
  releaseBanks: string[];
  /** which scopes can NOT release this scene */
  protectFromRelease: 'off' | 'all' | 'bank' | 'outside-bank' | 'specific';
  protectBanks: string[];
  /** flash button — play while held, release on up */
  flash: boolean;
}

export interface BankDTO {
  id: string;
  name: string;
  scenes: SceneDTO[];
}

/** Sparse scene channel values — { [universeId]: { [absChannel]: value } }. */
export type SceneValuesDTO = Record<number, Record<number, number>>;

export interface OutputDTO {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  isOpen: boolean;
  host: string | null;
  port: number | null;
  maxRateHz: number | null;
  /** transmission mode — standard (on-change + keep-alive) / full / partial */
  frameMode: 'standard' | 'full' | 'partial';
  subscribedUniverses: number[];
}

/** On-disk project file (format version 1). */
export interface ProjectData {
  format: 'lumox-project';
  version: number;
  name?: string;
  // Section item shapes are validated lazily on restore; kept loose here.
  library?: any[];
  patch?: any[];
  groups?: any[];
  scenes?: any[];
  banks?: any[];
  devices?: any[];
  /** reusable colour palettes */
  palettes?: any[];
  /** saved FX-rack presets */
  presets?: any[];
  /** master tempo (BPM) for beat-synced scenes */
  bpm?: number;
  /** MIDI control-surface bindings (trigger → Lumox target) */
  midiBindings?: any[];
}

/** Current project identity surfaced to the renderer (titlebar). */
export interface ProjectInfo {
  name: string;
  path: string | null;
  /** unsaved changes since the last save/open/new */
  dirty: boolean;
}

/**
 * A discrepancy found when opening a project — a fixture whose definition (or
 * mode) is not available on this machine. Surfaced to the user in a popup; the
 * affected fixtures are skipped (missing definition) or fall back (missing mode).
 */
export interface ProjectIssue {
  kind: 'missing-definition' | 'missing-mode';
  definitionId: string;
  modeId?: string;
  count: number;
  fixtures: string[];
}

/** UI language. Translation tables are added per locale as the UI is localized. */
export type AppLanguage = 'en' | 'de';

/** Default transport for the broadcast output created at startup. */
export type DmxProtocol = 'artnet' | 'sacn';

/**
 * Where the master tempo (BPM) comes from:
 *   'manual' — typed / scrubbed / tapped in the titlebar (default)
 *   'midi'   — locked to an external MIDI clock (24 ppqn) from a chosen input
 *   'audio'  — estimated from audio onsets (renderer Web Audio analyser)
 *   'link'   — slaved to an Ableton Link session (optional native addon)
 */
export type TempoSource = 'manual' | 'midi' | 'audio' | 'link';

/** Live transport state surfaced to the renderer (titlebar + settings). */
export interface TransportStatus {
  /** master tempo (BPM). */
  bpm: number;
  source: TempoSource;
  /** source !== 'manual' — an external clock drives the tempo (the field is read-only). */
  locked: boolean;
  /** chosen MIDI input port for the 'midi' source (null = none). */
  midiInput: string | null;
  /** which non-manual sources can actually run on this machine right now. */
  available: { midi: boolean; link: boolean };
}

/**
 * Application-level preferences — machine-scoped, NOT part of a project. Stored
 * as `settings.json` in the Electron `userData` directory and managed by
 * SettingsService. Missing/invalid fields fall back to DEFAULT_SETTINGS.
 */
export interface AppSettings {
  /** UI language (applied to `<html lang>`; full string translation is staged). */
  language: AppLanguage;
  /** Accent colour (hex) driving the `--accent` CSS custom property. */
  accent: string;
  /** Transport of the startup broadcast output. */
  dmxProtocol: DmxProtocol;
  /** Art-Net broadcast/unicast target (ignored for sACN multicast). */
  broadcastHost: string;
  /** Output refresh cap in Hz (1..60). */
  maxRateHz: number;
  /** Autosave period for a named project, in minutes (0 = off). */
  autosaveMinutes: number;
  /** Reopen the last-saved project on launch instead of a blank show. */
  reopenLastProject: boolean;
  /** Path of the most recently saved/opened project (for reopen-on-launch). */
  lastProjectPath: string | null;
  /** Where the master tempo comes from (manual / midi / audio / link). */
  tempoSource: TempoSource;
  /** MIDI input port name for the 'midi' clock source (null = none chosen). */
  midiClockInput: string | null;
}
