// Global typing for the `window.lumox.*` API exposed by preload.cjs via
// contextBridge. Mirrors the namespaces and methods in preload.cjs. Where the
// returned shape is complex the engine-side return is left as `Promise<any>`.

export {};

export type FxKind = 'color' | 'move' | 'curve' | 'chaser' | 'value' | 'matrix';
export type MatrixPattern = 'wipe' | 'radial' | 'plasma';
export type FxOrder = 'patch' | 'reverse' | 'mirror' | 'random' | 'row' | 'column' | 'diagonal';

/** Options for `library.createMatrix` — a generated multi-cell matrix/strip. */
export interface MatrixGenOptions {
  shape: 'matrix' | 'strip';
  width: number;
  height: number;
  color: 'rgb' | 'rgbw';
  cellDimmer?: boolean;
  masterDimmer?: boolean;
  name?: string;
}
export type FxWave = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'random';
export type FxTargetSel = { mode: 'all' } | { mode: 'group'; groupId: string } | { mode: 'selection' };
export type ReleaseScope = 'off' | 'all' | 'bank' | 'outside-bank' | 'specific';

export type AppLanguage = 'en' | 'de';
export type DmxProtocol = 'artnet' | 'sacn';
export type FrameMode = 'standard' | 'full' | 'partial';
export type TempoSource = 'manual' | 'midi' | 'audio' | 'link';

/** Live transport state (mirrors TransportStatus in main/dto.ts). */
export interface TransportStatus {
  bpm: number;
  source: TempoSource;
  locked: boolean;
  midiInput: string | null;
  available: { midi: boolean; link: boolean };
}
export type DiscoveryStatus = 'stopped' | 'running' | 'degraded';

/** One row of the per-universe output patch (Connection tab). */
export interface UniverseOutputRow {
  universeId: number;
  universeName: string;
  protocol: DmxProtocol;
  host: string;
  frameMode: FrameMode;
  maxRateHz: number;
  enabled: boolean;
  isOpen: boolean;
  transmitting: boolean;
}

/** A DMX node found on the network (Art-Net ArtPollReply). Mirrors DiscoveredDevice. */
export interface DiscoveredDevice {
  mac: string;
  ip: string;
  shortName: string;
  longName: string;
  universe: number;
  net: number;
  subnet: number;
  oem: number;
  firmware: string;
  isLumox: boolean;
  firstSeen: number;
  lastSeen: number;
}

/** Application preferences. Mirrors AppSettings in main/dto.ts. */
export interface AppSettings {
  language: AppLanguage;
  accent: string;
  dmxProtocol: DmxProtocol;
  broadcastHost: string;
  maxRateHz: number;
  autosaveMinutes: number;
  reopenLastProject: boolean;
  lastProjectPath: string | null;
  tempoSource: TempoSource;
  midiClockInput: string | null;
  audioInput: string | null;
  audioBands: number;
}

/** One armed feature of a value-driving FX layer: attribute + output window. */
export interface FxFeature { attr: string; min: number; max: number; }

/** One effect layer in a scene's FX rack. Mirrors FxLayerDTO. */
export interface FxLayerInfo {
  id: string;
  kind: FxKind;
  enabled: boolean;
  target: FxTargetSel;
  order: FxOrder;
  rateMs: number;
  speed: number;
  driveMode: 'off' | 'bpm';
  beatDiv: number;
  direction: 'forward' | 'backward' | 'bounce';
  size: number;
  spread: number;
  beams: number;
  /** fixture id behind each preview beam, index-aligned with `beams` (sweep order) */
  beamFixtureIds: string[];
  color?: { palette: string[]; grayscale: boolean; colorWidth: number; angle: number; saturation: number; fade: number; randomize: boolean };
  move?: { shape: 'circle' | 'figure8' | 'line' | 'square'; symmetry: boolean; sizeX: number; sizeY: number; centerX: number; centerY: number; phaseShape: number };
  curve?: { waveform: FxWave; duty: number; invert: boolean; features: FxFeature[] };
  chaser?: { litCount: number; gap: number; fade: number; features: FxFeature[] };
  value?: { waveform: FxWave; duty: number; invert: boolean; staticValue: number | null; features: FxFeature[] };
  matrix?: { pattern: MatrixPattern; palette: string[]; saturation: number; fade: number; angle: number; scale: number };
}

/** A fixture's 2D top-down stage placement. Mirrors StageTransformDTO. */
export interface StageTransform { x: number; y: number; rotation: number; }

/** Per-fixture output limits (coarse DMX 0..255). Mirrors FixtureLimitsDTO. */
export interface FixtureLimits {
  dimmer?: { max: number };
  pan?:  { min: number; max: number; invert?: boolean };
  tilt?: { min: number; max: number; invert?: boolean };
  swapPanTilt?: boolean;
}

/** Scene state surfaced to the renderer (Scene Properties panel). Mirrors SceneDTO. */
export interface SceneInfo {
  id: string;
  name: string;
  color: string;
  opacity: number;
  active: boolean;
  type: 'static' | 'chase';
  stepCount: number;
  /** chase: per-step timing (ms), in play order */
  steps: { fadeMs: number; waitMs: number }[];
  /** FX rack — ordered effect layers over the base look */
  layers: FxLayerInfo[];
  /** fixtures this scene drives (base look or any step), patch order — selecting
   *  the scene auto-selects these on the stage */
  fixtureIds: string[];
  level: number;
  speed: number;
  fadeIn: number;
  fadeOut: number;
  fadeSpeed: number;
  phaseIn: number;
  phaseOut: number;
  driveMode: 'off' | 'bpm';
  beatDiv: number;
  startMode: 'restart' | 'continue' | 'random';
  direction: 'forward' | 'backward' | 'bounce';
  paused: boolean;
  // ---- Advanced panel ----
  priority: 'low' | 'normal' | 'high';
  loop: { mode: 'always' | 'count'; count: number };
  jumpTo: { mode: 'next' | 'prev' | 'scene'; sceneId?: string } | null;
  releaseAtEnd: boolean;
  releaseMode: ReleaseScope;
  releaseBanks: string[];
  protectFromRelease: ReleaseScope;
  protectBanks: string[];
  flash: boolean;
}

// ---- MIDI control surface ----
export type MidiActionKind = 'trigger' | 'range';

/** A binding's pointer at one registry action + the object it targets. Mirrors MidiActionRef. */
export interface MidiActionRef {
  key: string;                 // 'scene.recall', 'group.level', 'master.level', 'blackout.toggle', …
  params: Record<string, string>;   // { sceneId } / { groupId } / { fixtureId, channel } / {}
}

/** What the hardware sends. */
export interface MidiTrigger {
  type: 'note' | 'cc';
  channel: number;
  number: number;
}

export interface MidiBindingOptions {
  mode?: 'toggle' | 'flash';
  invert?: boolean;
  relative?: boolean;                      // range bindings — treat CC as a signed encoder delta
  min?: number;
  max?: number;
  ledColor?: string;                       // device palette name (note/pad bindings)
  ledMode?: 'solid' | 'blink' | 'fade';    // active-state LED animation
}

/** One mappings-table row — the registry-computed label + kind ride along. Mirrors MidiBindingView. */
export interface MidiBinding {
  id: string;
  trigger: MidiTrigger;
  action: MidiActionRef;
  label: string;
  kind: MidiActionKind;
  options: MidiBindingOptions;
}

/** One selectable LED colour offered by the connected device. */
export interface MidiPaletteColor { name: string; hex: string; }

/** What the connected device supports for LED feedback (empty = no LEDs). */
export interface MidiCapabilities {
  deviceId: string | null;
  palette: MidiPaletteColor[];
  ledModes: ('solid' | 'blink' | 'fade')[];
}

export interface MidiStatus {
  connected: boolean;
  portName: string | null;
  deviceName: string | null;
  capabilities: MidiCapabilities;
}
export interface MidiMonitorMessage { type: 'note' | 'cc'; channel: number; number: number; value: number; }
export interface MidiAssignMode { active: boolean; }
export interface MidiAwaitingInput { waiting: boolean; label?: string; }
export interface MidiFeedback { id: string; active?: boolean; value?: number; }

// ---- audio-reactive input ----
export type AudioTargetKind = 'range' | 'trigger';
export type AudioCurve = 'linear' | 'exp' | 'log';
/** Where a binding reads its 0..1 level. Mirrors AudioSource. */
export interface AudioSource { type: 'band' | 'volume' | 'beat'; index?: number; }
/** A bindable Lumox control. Mirrors AudioTarget. */
export interface AudioTarget { key: string; label: string; kind: AudioTargetKind; min?: number; max?: number; }
export interface AudioBindingOptions {
  min?: number; max?: number; invert?: boolean; curve?: AudioCurve;
  threshold?: number; mode?: 'flash' | 'toggle';
}
/** One audio binding row. Mirrors AudioBinding. */
export interface AudioBinding {
  id: string;
  source: AudioSource;
  target: AudioTarget;
  options: AudioBindingOptions;
}

/** Spec for the generic dialog window (mirrors DialogSpec in main/handlers/dialog.ts). */
export interface DialogButton { id: string; label: string; variant?: 'default' | 'primary' | 'danger'; }
export interface DialogSpec {
  title: string;
  message: string;
  detail?: string;
  list?: string[];
  input?: { value?: string; placeholder?: string };   // present → a single text field (rename / name prompt)
  buttons: DialogButton[];
  cancelId: string;
  width?: number;
  height?: number;
}

export interface LumoxApi {
  outputs: {
    list(): Promise<any>;
    available(): Promise<any>;
    patch(): Promise<UniverseOutputRow[]>;
    setUniverse(cfg: Partial<UniverseOutputRow> & { universeId: number }): Promise<any>;
    removeUniverse(universeId: number): Promise<any>;
  };
  discovery: {
    start(): Promise<DiscoveryStatus>;
    stop(): Promise<void>;
    list(): Promise<DiscoveredDevice[]>;
    onChanged(cb: (devices: DiscoveredDevice[]) => void): void;
  };
  universes: {
    list(): Promise<any[]>;
    ensure(id: number, name?: string): Promise<any>;
    setChannel(id: number, channel: number, value: number): Promise<any>;
    read(id: number): Promise<number[] | null | undefined>;
  };
  master: {
    set(value: number): Promise<any>;
  };
  blackout: {
    set(active: boolean): Promise<any>;
  };
  engine: {
    start(): Promise<any>;
    stop(): Promise<any>;
    status(): Promise<any>;
  };
  library: {
    vendors(): Promise<{ name: string; count: number; source: string }[]>;
    vendor(name: string): Promise<any[]>;
    list(): Promise<any[]>;
    channelTypes(): Promise<any[]>;
    add(def: any, replaceId?: string): Promise<any>;
    createMatrix(opts: MatrixGenOptions): Promise<any>;
    remove(id: string): Promise<{ ok: boolean; id: string }>;
    onChanged(cb: () => void): void;
  };
  editor: {
    open(defId?: string): Promise<any>;
    target(): Promise<{ def: any; source: string } | null>;
  };
  project: {
    new: () => Promise<any>;
    save(): Promise<any>;
    saveAs(): Promise<any>;
    open(): Promise<any>;
    info(): Promise<{ name: string; path: string | null; dirty: boolean }>;
    report(): Promise<Array<{ kind: string; definitionId: string; modeId?: string; count: number; fixtures: string[] }>>;
    onLoaded(cb: () => void): void;
    onChanged(cb: (info: { name: string; path: string | null; dirty: boolean }) => void): void;
  };
  dialog: {
    open(spec: DialogSpec): Promise<string>;
    prompt(spec: DialogSpec): Promise<string | null>;
    spec(): Promise<DialogSpec | null>;
    resolve(id: string, value?: string): Promise<void>;
  };
  panel: {
    open(spec: { kind: 'settings' | 'group-order' | 'create-matrix'; title: string; arg?: unknown; width?: number; height?: number }): Promise<void>;
    spec(): Promise<{ kind: 'settings' | 'group-order' | 'create-matrix'; title: string; arg?: any } | null>;
  };
  history: {
    undo(): Promise<{ canUndo: boolean; canRedo: boolean }>;
    redo(): Promise<{ canUndo: boolean; canRedo: boolean }>;
    state(): Promise<{ canUndo: boolean; canRedo: boolean }>;
  };
  patch: {
    list(): Promise<any[]>;
    add(opts: any): Promise<any>;
    move(opts: any): Promise<any>;
    remove(id: string): Promise<any>;
    rename(id: string, name: string): Promise<any>;
    setTransform(id: string, transform: Partial<StageTransform>): Promise<any>;
    placeInitial(id: string, transform: Partial<StageTransform>): Promise<any>;
    overlaps(): Promise<any>;
  };
  groups: {
    list(): Promise<any[]>;
    add(opts: any): Promise<any>;
    remove(id: string): Promise<any>;
    setFixtures(id: string, fixtureIds: string[]): Promise<any>;
    rename(id: string, name: string, color?: string): Promise<any>;
  };
  selection: {
    get(): Promise<string[]>;
    set(ids: string[]): Promise<string[]>;
    add(ids: string[]): Promise<string[]>;
    remove(ids: string[]): Promise<string[]>;
    clear(): Promise<string[]>;
    all(): Promise<string[]>;
    invert(): Promise<string[]>;
    reorder(from: number, to: number): Promise<string[]>;
    onChanged(cb: (ids: string[]) => void): void;
  };
  selections: {
    list(): Promise<{ id: string; name: string; fixtureIds: string[] }[]>;
    save(fixtureIds: string[], name?: string): Promise<{ id: string; name: string; fixtureIds: string[] } | null>;
    rename(id: string, name: string): Promise<void>;
    remove(id: string): Promise<void>;
    setFixtures(id: string, fixtureIds: string[]): Promise<void>;
    recall(id: string): Promise<string[]>;
  };
  fixtures: {
    setChannel(fixtureId: string, channel: number, value: number, absChannel?: number): Promise<any>;
    releaseChannel(fixtureId: string, channel: number, absChannel?: number): Promise<any>;
    clearProgrammer(): Promise<{ channels: number; universes: number[] }>;
    programmer(): Promise<{ channels: number; universes: number[] }>;
    setLimits(fixtureIds: string[], patch: Partial<FixtureLimits> & Record<string, unknown>): Promise<void>;
    clearLimits(fixtureIds: string[]): Promise<void>;
  };
  scenes: {
    list(): Promise<any[]>;
    values(id: string): Promise<Record<number, Record<number, number>>>;
    monitor(id: string | null, fixtureIds: string[]): Promise<{ active: boolean; cycleMs: number; values: Record<number, Record<number, number>> }>;
    capture(bankId?: string, name?: string): Promise<any>;
    recall(id: string, on: boolean): Promise<any>;
    remove(id: string): Promise<any>;
    rename(id: string, name: string): Promise<any>;
    update(id: string): Promise<any>;
    merge(id: string): Promise<void>;
    setColor(id: string, color: string): Promise<any>;
    setChannel(id: string, fixtureId: string, channel: number, value: number | null, absChannel?: number, blind?: boolean): Promise<any>;
    commit(id: string): Promise<any>;
    setType(id: string, type: string): Promise<any>;
    setRate(id: string, rateMs: number): Promise<any>;
    addStep(id: string): Promise<number>;
    removeStep(id: string, index: number): Promise<number>;
    moveStep(id: string, index: number, delta: number): Promise<number>;
    setStepTiming(id: string, index: number, timing: { fadeMs?: number; waitMs?: number }): Promise<{ fadeMs: number; waitMs: number } | null>;
    duplicate(id: string): Promise<any>;
    get(id: string): Promise<SceneInfo | null>;
    setLevel(id: string, level: number): Promise<SceneInfo | null>;
    setSpeed(id: string, speed: number): Promise<SceneInfo | null>;
    setFade(id: string, opts: { fadeIn?: number; fadeOut?: number; fadeSpeed?: number; phaseIn?: number; phaseOut?: number }): Promise<SceneInfo | null>;
    setDrive(id: string, opts: { mode?: 'off' | 'bpm'; beatDiv?: number }): Promise<SceneInfo | null>;
    setStartMode(id: string, mode: 'restart' | 'continue' | 'random'): Promise<SceneInfo | null>;
    setDirection(id: string, direction: 'forward' | 'backward' | 'bounce'): Promise<SceneInfo | null>;
    // Advanced panel
    setPriority(id: string, priority: 'low' | 'normal' | 'high'): Promise<SceneInfo | null>;
    setLoop(id: string, opts: { mode?: 'always' | 'count'; count?: number }): Promise<SceneInfo | null>;
    setJumpTo(id: string, jumpTo: { mode: 'next' | 'prev' | 'scene'; sceneId?: string } | null): Promise<SceneInfo | null>;
    setReleaseAtEnd(id: string, on: boolean): Promise<SceneInfo | null>;
    setReleaseMode(id: string, opts: { mode?: ReleaseScope; banks?: string[] }): Promise<SceneInfo | null>;
    setProtect(id: string, opts: { mode?: ReleaseScope; banks?: string[] }): Promise<SceneInfo | null>;
    setFlash(id: string, on: boolean): Promise<SceneInfo | null>;
    // FX rack layers
    addLayer(id: string, kind: FxKind): Promise<{ scene: SceneInfo; layerId: string } | null>;
    removeLayer(id: string, layerId: string): Promise<SceneInfo | null>;
    moveLayer(id: string, layerId: string, delta: number): Promise<SceneInfo | null>;
    setLayerEnabled(id: string, layerId: string, enabled: boolean): Promise<SceneInfo | null>;
    setLayerTarget(id: string, layerId: string, mode: 'all' | 'group' | 'selection', groupId?: string): Promise<SceneInfo | null>;
    setLayerOrder(id: string, layerId: string, order: FxOrder): Promise<SceneInfo | null>;
    setLayerTiming(id: string, layerId: string, opts: { rateMs?: number; speed?: number; driveMode?: 'off' | 'bpm'; beatDiv?: number; direction?: 'forward' | 'backward' | 'bounce'; size?: number; spread?: number }): Promise<SceneInfo | null>;
    setLayerConfig(id: string, layerId: string, cfg: Record<string, unknown>): Promise<SceneInfo | null>;
    armFeature(id: string, layerId: string, attr: string): Promise<SceneInfo | null>;
    unarmFeature(id: string, layerId: string, attr: string): Promise<SceneInfo | null>;
    setFeatureRange(id: string, layerId: string, attr: string, min: number | null, max: number | null): Promise<SceneInfo | null>;
    transport(id: string, action: 'pause' | 'resume' | 'next' | 'prev' | 'toStart' | 'toEnd'): Promise<SceneInfo | null>;
    /** Live playhead of one FX layer (null when the scene isn't live). */
    layerPhase(id: string, layerId: string): Promise<{ phaseMs: number; periodMs: number; paused: boolean } | null>;
  };
  palettes: {
    list(): Promise<{ id: string; name: string; colors: string[] }[]>;
    add(name: string, colors: string[]): Promise<{ id: string; name: string; colors: string[] }>;
    rename(id: string, name: string): Promise<any>;
    remove(id: string): Promise<any>;
  };
  presets: {
    list(): Promise<{ id: string; name: string; layers: FxLayerInfo[] }[]>;
    saveRack(sceneId: string, name: string): Promise<{ id: string; name: string } | null>;
    applyRack(sceneId: string, presetId: string): Promise<SceneInfo | null>;
    rename(id: string, name: string): Promise<any>;
    remove(id: string): Promise<any>;
  };
  transport: {
    get(): Promise<TransportStatus>;
    setBpm(bpm: number): Promise<number>;
    setSource(source: TempoSource, midiInput?: string | null): Promise<TransportStatus>;
    audioBpm(bpm: number): Promise<number>;
    midiInputs(): Promise<string[]>;
    onChanged(cb: (status: TransportStatus) => void): void;
  };
  banks: {
    list(): Promise<any[]>;
    add(name?: string): Promise<any>;
    rename(id: string, name: string): Promise<any>;
    remove(id: string): Promise<any>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: Partial<AppSettings>): Promise<AppSettings>;
    onChanged(cb: (settings: AppSettings) => void): void;
  };
  midi: {
    openWindow(): Promise<any>;
    status(): Promise<MidiStatus>;
    listBindings(): Promise<MidiBinding[]>;
    beginAssign(): Promise<any>;
    pickTarget(descriptor: string | string[]): Promise<any>;
    cancelAssign(): Promise<any>;
    setBindingOptions(id: string, options: MidiBindingOptions): Promise<any>;
    removeBinding(id: string): Promise<any>;
    onStatus(cb: (status: MidiStatus) => void): void;
    onBindings(cb: (bindings: MidiBinding[]) => void): void;
    onAssignMode(cb: (mode: MidiAssignMode) => void): void;
    onAwaitingInput(cb: (info: MidiAwaitingInput) => void): void;
    onMessage(cb: (msg: MidiMonitorMessage) => void): void;
    onFeedback(cb: (feedback: MidiFeedback[]) => void): void;
  };
  audio: {
    levels(frame: { bands: number[]; volume: number; beat: boolean }): Promise<void>;
    targets(): Promise<AudioTarget[]>;
    listBindings(): Promise<AudioBinding[]>;
    addBinding(source: AudioSource, target: AudioTarget): Promise<AudioBinding | null>;
    setBinding(id: string, patch: { source?: AudioSource; target?: AudioTarget }): Promise<any>;
    setBindingOptions(id: string, options: AudioBindingOptions): Promise<any>;
    removeBinding(id: string): Promise<any>;
    onBindings(cb: (bindings: AudioBinding[]) => void): void;
    onStream(cb: (on: boolean) => void): void;
  };
  win: {
    minimize(): Promise<any>;
    maximize(): Promise<any>;
    close(): Promise<any>;
    isMaximized(): Promise<boolean>;
    onMaximized(cb: (isMax: boolean) => void): void;
    closeSelf(): Promise<any>;
    minimizeSelf(): Promise<any>;
  };
  /** Dev-only main-process introspection. Rejects unless the app was launched
   *  with LUMOX_DEV=1 (the `npm run shot` wrapper sets it). See main/handlers/dev.ts. */
  dev: {
    eval(code: string): Promise<any>;
    state(): Promise<any>;
  };
}

declare global {
  interface Window {
    lumox: LumoxApi;
  }
}
