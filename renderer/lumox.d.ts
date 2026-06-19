// Global typing for the `window.lumox.*` API exposed by preload.cjs via
// contextBridge. Mirrors the namespaces and methods in preload.cjs. Where the
// returned shape is complex the engine-side return is left as `Promise<any>`.

export {};

export type FxKind = 'color' | 'move' | 'curve' | 'chaser' | 'value' | 'matrix';
export type MatrixPattern = 'wipe' | 'radial' | 'plasma';
export type FxOrder = 'patch' | 'reverse' | 'mirror' | 'random';
export type FxWave = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'random';
export type FxTargetSel = { mode: 'all' } | { mode: 'group'; groupId: string };
export type ReleaseScope = 'off' | 'all' | 'bank' | 'outside-bank' | 'specific';

export type AppLanguage = 'en' | 'de';
export type DmxProtocol = 'artnet' | 'sacn';
export type FrameMode = 'standard' | 'full' | 'partial';
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
}

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
  color?: { palette: string[]; grayscale: boolean; colorWidth: number; angle: number; saturation: number; fade: number; randomize: boolean };
  move?: { shape: 'circle' | 'figure8' | 'line' | 'square'; symmetry: boolean; sizeX: number; sizeY: number; centerX: number; centerY: number; phaseShape: number };
  curve?: { waveform: FxWave; attr: string; min: number; max: number; duty: number; invert: boolean };
  chaser?: { attr: string; litCount: number; gap: number; fade: number; level: number; bg: number };
  value?: { attr: string; waveform: FxWave; min: number; max: number; duty: number; invert: boolean; staticValue: number | null };
  matrix?: { pattern: MatrixPattern; palette: string[]; saturation: number; fade: number; angle: number; scale: number };
}

/** A fixture's 2D top-down stage placement. Mirrors StageTransformDTO. */
export interface StageTransform { x: number; y: number; rotation: number; }

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

export interface LumoxApi {
  outputs: {
    list(): Promise<any>;
    available(): Promise<any>;
    patch(): Promise<UniverseOutputRow[]>;
    setUniverse(cfg: Partial<UniverseOutputRow> & { universeId: number }): Promise<any>;
    removeUniverse(universeId: number): Promise<any>;
    addUniverse(): Promise<number>;
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
    list(): Promise<any[]>;
    channelTypes(): Promise<any[]>;
    add(def: any): Promise<any>;
    remove(id: string): Promise<{ ok: boolean; id: string }>;
    onChanged(cb: () => void): void;
  };
  editor: {
    open(): Promise<any>;
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
    overlaps(): Promise<any>;
  };
  groups: {
    list(): Promise<any[]>;
    add(opts: any): Promise<any>;
    remove(id: string): Promise<any>;
    setFixtures(id: string, fixtureIds: string[]): Promise<any>;
    rename(id: string, name: string, color?: string): Promise<any>;
  };
  fixtures: {
    setChannel(fixtureId: string, channel: number, value: number): Promise<any>;
    releaseChannel(fixtureId: string, channel: number): Promise<any>;
    clearProgrammer(): Promise<{ channels: number; universes: number[] }>;
    programmer(): Promise<{ channels: number; universes: number[] }>;
  };
  scenes: {
    list(): Promise<any[]>;
    values(id: string): Promise<Record<number, Record<number, number>>>;
    capture(bankId?: string, name?: string): Promise<any>;
    recall(id: string, on: boolean): Promise<any>;
    remove(id: string): Promise<any>;
    rename(id: string, name: string): Promise<any>;
    update(id: string): Promise<any>;
    merge(id: string): Promise<void>;
    setColor(id: string, color: string): Promise<any>;
    setChannel(id: string, fixtureId: string, channel: number, value: number | null): Promise<any>;
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
    setLayerTarget(id: string, layerId: string, mode: 'all' | 'group', groupId?: string): Promise<SceneInfo | null>;
    setLayerOrder(id: string, layerId: string, order: FxOrder): Promise<SceneInfo | null>;
    setLayerTiming(id: string, layerId: string, opts: { rateMs?: number; speed?: number; driveMode?: 'off' | 'bpm'; beatDiv?: number; direction?: 'forward' | 'backward' | 'bounce'; size?: number; spread?: number }): Promise<SceneInfo | null>;
    setLayerConfig(id: string, layerId: string, cfg: Record<string, unknown>): Promise<SceneInfo | null>;
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
    get(): Promise<{ bpm: number }>;
    setBpm(bpm: number): Promise<number>;
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
  win: {
    minimize(): Promise<any>;
    maximize(): Promise<any>;
    close(): Promise<any>;
    isMaximized(): Promise<boolean>;
    onMaximized(cb: (isMax: boolean) => void): void;
    closeSelf(): Promise<any>;
    minimizeSelf(): Promise<any>;
  };
}

declare global {
  interface Window {
    lumox: LumoxApi;
  }
}
