// ProjectService — (de)serialization of the whole show to/from the `.lmx`
// project format, plus the "current project" identity (name / path / dirty).
// Pure domain logic: no Electron, no file dialogs (the project IPC handler owns
// the dialog + fs I/O and forwards `projectEvents` to the renderer).

import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Fixture, Group, Scene, toChaseStep, DEFAULT_STEP_WAIT, denormalizeTransform } from '../../src/index';
import { engine, show, banks } from '../context';
import {
  liveUniverses, updateActiveUniverses, applyOutputPatch, seedDefaultOutputs, savedOutputs,
} from './OutputPatchService';
import { sceneTrack } from './SceneCompiler';
import { ensureDefaultScene } from './SceneOrchestrator';
import { rebuildFixtureMaps } from './FixtureMaps';
import { transport } from './Transport';
import { palettes, presets } from './presets';
import { listMidiBindings, loadMidiBindings } from './MidiService';
import { listAudioBindings, loadAudioBindings } from './AudioBindingService';
import { getSetting } from './SettingsService';
import type { ProjectData, ProjectInfo, ProjectIssue } from '../dto';

/** Seed a default per-universe output patch from the global DMX defaults. */
function seedOutputsFromSettings(): void {
  seedDefaultOutputs({
    protocol: getSetting('dmxProtocol'),
    host: getSetting('broadcastHost'),
    maxRateHz: getSetting('maxRateHz'),
  });
}

const PROJECT_FORMAT = 'lumox-project';
const PROJECT_VERSION = 1;   // single current format (FX-rack scenes); dev phase — no legacy loaders
const DEFAULT_NAME = 'Untitled';
const UNIVERSE_COUNT = 5;

// ---- current project identity ------------------------------------------
// Emits 'changed' (ProjectInfo) whenever name/path/dirty changes so the shell
// can update the titlebar without the renderer polling.
export const projectEvents = new EventEmitter();
let current: ProjectInfo = { name: DEFAULT_NAME, path: null, dirty: false };

export const projectInfo = (): ProjectInfo => ({ ...current });

/** Set the identity and clear the dirty flag (after save / open / new). */
export function setProject(name: string, path: string | null): void {
  current = { name: name || DEFAULT_NAME, path, dirty: false };
  projectEvents.emit('changed', projectInfo());
}

/** Flag unsaved changes (first transition only — cheap to call on every edit). */
export function markDirty(): void {
  if (current.dirty) return;
  current.dirty = true;
  projectEvents.emit('changed', projectInfo());
}

/** Reset to a blank Untitled show: clear content, restore default universes/bank. */
export function newProject(): void {
  show.patch.clear();
  show.groups.clear();
  show.clearSelections();
  show.clearScenes();
  engine.scenes.clear();
  banks.clear();
  palettes.clear();
  presets.clear();
  loadMidiBindings([]);
  loadAudioBindings([]);
  banks.ensureDefault();
  ensureDefaultScene();
  transport.reset();
  for (let i = 0; i < UNIVERSE_COUNT; i++) engine.universes.ensure(i, `Universe ${i + 1}`);
  for (const u of engine.universes.list()) u.fillProgrammer(0);
  liveUniverses.clear();
  seedOutputsFromSettings();
  setProject(DEFAULT_NAME, null);
  updateActiveUniverses();
}

/** Snapshot the current show into a serializable project object. */
export function buildProject(): ProjectData {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: current.name,
    library: show.library.list().filter((d) => d.source === 'user').map((d) => d.toJSON()),
    patch: show.patch.list().map((fx) => fx.toJSON()),
    groups: show.groups.list().map((g) => ({ ...g.toJSON(), configKey: g.configKey ?? null })),
    selections: show.listSelections().map((s) => ({ id: s.id, name: s.name, fixtureIds: [...s.fixtureIds] })),
    scenes: show.listScenes().map((s) => ({
      id: s.id, name: s.name, color: s.color ?? null, values: s.values, fadeIn: s.fadeIn, fadeOut: s.fadeOut,
      type: s.type, steps: s.steps, rateMs: s.rateMs,
      level: s.level, speed: s.speed, fadeSpeed: s.fadeSpeed, phaseIn: s.phaseIn, phaseOut: s.phaseOut,
      driveMode: s.driveMode, beatDiv: s.beatDiv, startMode: s.startMode, direction: s.direction,
      layers: s.layers,
      priority: s.priority, loop: s.loop, jumpTo: s.jumpTo, releaseAtEnd: s.releaseAtEnd,
      releaseMode: s.releaseMode, releaseBanks: s.releaseBanks,
      protectFromRelease: s.protectFromRelease, protectBanks: s.protectBanks, flash: s.flash,
    })),
    banks: banks.toJSON(),
    devices: savedOutputs(),
    palettes: palettes.toJSON(),
    presets: presets.toJSON(),
    bpm: transport.getBpm(),
    midiBindings: listMidiBindings(),
    audioBindings: listAudioBindings(),
  };
}

/**
 * Validate a parsed project before mutating any engine state. Rejecting
 * malformed input up-front avoids half-applied loads from untrusted files.
 */
export function validateProject(p: unknown): asserts p is ProjectData {
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    throw new Error('Not a Lumox project file');
  }
  const o = p as Record<string, unknown>;
  if (o.format !== PROJECT_FORMAT) throw new Error('Not a Lumox project file');
  if (!Number.isInteger(o.version) || (o.version as number) < 1) {
    throw new Error(`Unsupported project version: ${o.version}`);
  }
  if (o.name != null && typeof o.name !== 'string') {
    throw new Error('Invalid project: "name" must be a string');
  }
  // Optional sections must be arrays when present.
  for (const key of ['library', 'patch', 'groups', 'selections', 'scenes', 'banks', 'devices'] as const) {
    if (o[key] != null && !Array.isArray(o[key])) {
      throw new Error(`Invalid project: "${key}" must be an array`);
    }
  }
}

/**
 * Inspect a (validated) project for fixtures that can't be fully restored on
 * this machine: their definition isn't installed, or the definition exists but
 * the saved mode is gone. Embedded user definitions (`p.library`) count as
 * available. Pure — does not mutate state; run before `restoreProject` to warn.
 */
export function analyzeProject(p: ProjectData): ProjectIssue[] {
  const installed = new Set(show.library.list().map((d) => d.id));
  const embedded = new Set((p.library ?? []).map((d) => d?.id).filter(Boolean));
  const missingDef = new Map<string, ProjectIssue>();
  const missingMode = new Map<string, ProjectIssue>();

  for (const fj of p.patch ?? []) {
    const name = fj?.name || fj?.id || '?';
    if (!installed.has(fj.definitionId) && !embedded.has(fj.definitionId)) {
      record(missingDef, fj.definitionId, { kind: 'missing-definition', definitionId: fj.definitionId }, name);
      continue;
    }
    // Mode check only for installed defs (embedded defs carry their own modes).
    const def = show.library.get(fj.definitionId);
    if (def && fj.modeId && !def.mode(fj.modeId)) {
      const key = `${fj.definitionId}::${fj.modeId}`;
      record(missingMode, key, { kind: 'missing-mode', definitionId: fj.definitionId, modeId: fj.modeId }, name);
    }
  }
  return [...missingDef.values(), ...missingMode.values()];
}

function record(map: Map<string, ProjectIssue>, key: string, base: Omit<ProjectIssue, 'count' | 'fixtures'>, name: string): void {
  const e = map.get(key) ?? { ...base, count: 0, fixtures: [] };
  e.count++;
  if (e.fixtures.length < 12) e.fixtures.push(name);
  map.set(key, e);
}

// Discrepancy report from the last open, held until the renderer fetches it
// (it rebuilds on project load, so the popup is shown after the reload).
let lastReport: ProjectIssue[] = [];
export const setReport = (issues: ProjectIssue[]): void => { lastReport = issues; };
export const takeReport = (): ProjectIssue[] => { const r = lastReport; lastReport = []; return r; };

/** Replace all show state from a parsed project (validates first). */
export async function restoreProject(p: unknown): Promise<void> {
  validateProject(p);

  // user fixture definitions
  for (const d of p.library ?? []) {
    try { show.library.add(d, 'user'); }
    catch (err) { console.error('[show] project user fixture rejected:', (err as Error).message); }
  }

  // Lazy library: parse every bundled vendor the patch references before
  // resolving definitions below (and before the post-restore analyze).
  await show.library.ensureForIds((p.patch ?? []).map((fj: { definitionId?: string }) => fj?.definitionId).filter((x: unknown): x is string => !!x));

  // universes — ensure every one the project references (patch targets + saved
  // outputs), at least the default count; drop any extras from a prior project.
  const refIds = [UNIVERSE_COUNT - 1];
  for (const fj of p.patch ?? []) if (typeof fj?.universeId === 'number') refIds.push(fj.universeId);
  for (const dj of p.devices ?? []) if (typeof dj?.universeId === 'number') refIds.push(dj.universeId);
  const maxUniverse = Math.max(0, ...refIds);
  for (let i = 0; i <= maxUniverse; i++) engine.universes.ensure(i, `Universe ${i + 1}`);
  for (const u of [...engine.universes.list()]) if (u.id > maxUniverse) engine.universes.remove(u.id);

  // patch
  show.patch.clear();
  for (const fj of p.patch ?? []) {
    const def = show.library.get(fj.definitionId);
    if (!def) continue;
    const mode = def.mode(fj.modeId) ?? def.defaultMode;
    const fx = new Fixture({ id: fj.id, name: fj.name, definition: def, mode, universeId: fj.universeId, startAddress: fj.startAddress, stageTransform: denormalizeTransform(fj.stageTransform), limits: fj.limits ?? null });
    show.patch.add(fx);
    const u = engine.universes.get(fx.universeId);
    if (u) fx.apply(u);
  }
  rebuildFixtureMaps();   // re-resolve per-fixture limit + virtual-dimmer targets for the loaded patch

  // groups
  show.groups.clear();
  for (const gj of p.groups ?? []) {
    const g = show.groups.add(new Group(gj));
    g.configKey = gj.configKey ?? null;
  }

  // saved selections (named, ordered, recallable)
  show.clearSelections();
  for (const sj of p.selections ?? []) {
    if (!sj || typeof sj.id !== 'string') continue;
    show.addSelection({
      id: sj.id,
      name: String(sj.name ?? sj.id),
      fixtureIds: Array.isArray(sj.fixtureIds) ? sj.fixtureIds.filter((x: unknown) => typeof x === 'string') : [],
    });
  }

  // scenes
  engine.scenes.clear();
  show.clearScenes();
  for (const sj of p.scenes ?? []) {
    const s = new Scene({
      id: sj.id, name: sj.name, values: sj.values, fadeIn: sj.fadeIn, fadeOut: sj.fadeOut,
      type: sj.type === 'chase' ? 'chase' : 'static',
      steps: (sj.steps ?? []).map((st: unknown) => toChaseStep(st, sj.rateMs ?? DEFAULT_STEP_WAIT)),
      rateMs: sj.rateMs,
      level: sj.level, speed: sj.speed, fadeSpeed: sj.fadeSpeed, phaseIn: sj.phaseIn, phaseOut: sj.phaseOut,
      driveMode: sj.driveMode, beatDiv: sj.beatDiv, startMode: sj.startMode, direction: sj.direction,
      layers: sj.layers,
      priority: sj.priority, loop: sj.loop, jumpTo: sj.jumpTo, releaseAtEnd: sj.releaseAtEnd,
      releaseMode: sj.releaseMode, releaseBanks: sj.releaseBanks,
      protectFromRelease: sj.protectFromRelease, protectBanks: sj.protectBanks, flash: sj.flash,
    });
    s.color = sj.color ?? undefined;
    show.addScene(s);
    engine.scenes.addTrack(sceneTrack(s));
  }

  // master tempo (defaults to 120 when absent in older projects)
  transport.setBpm(typeof p.bpm === 'number' ? p.bpm : 120);

  // palettes + FX-rack presets
  palettes.load(p.palettes);
  presets.load(p.presets);

  // banks
  banks.load(p.banks ?? []);
  banks.ensureDefault();
  ensureDefaultScene();

  // MIDI + audio bindings — restore last (targets reference scenes/groups loaded
  // above; bindings whose target id vanished are dropped).
  loadMidiBindings(p.midiBindings ?? []);
  loadAudioBindings(p.audioBindings ?? []);

  // per-universe outputs — apply the project's patch, or seed defaults if the
  // project carries none (e.g. a project saved before per-universe output).
  const devices = (p.devices ?? []).filter(
    (d): d is typeof d & { universeId: number } => typeof d?.universeId === 'number' && d.universeId >= 0,
  );
  if (devices.length) {
    applyOutputPatch(devices.map((d) => ({
      universeId: d.universeId,
      protocol: d.protocol === 'sacn' ? 'sacn' : 'artnet',
      host: d.host ?? '255.255.255.255',
      frameMode: d.frameMode === 'full' || d.frameMode === 'partial' ? d.frameMode : 'standard',
      maxRateHz: typeof d.maxRateHz === 'number' ? d.maxRateHz : 40,
      enabled: d.enabled !== false,
    })));
  } else {
    seedOutputsFromSettings();
  }
  updateActiveUniverses();
}

const baseName = (p: string): string => path.basename(p).replace(/\.lmx$/i, '');

/**
 * Read a `.lmx` file from disk and replace all show state with it, recording the
 * discrepancy report and setting the project identity. Shared by the Open dialog
 * and reopen-on-launch. Throws a clear error if the file can't be read/parsed;
 * `restoreProject` validates the schema before mutating anything.
 */
export async function loadProjectFromPath(filePath: string): Promise<ProjectInfo> {
  let data: unknown;
  try {
    data = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read project file: ${(err as Error).message}`);
  }
  await restoreProject(data);
  setReport(analyzeProject(data as ProjectData));
  setProject((data as ProjectData).name || baseName(filePath), filePath);
  return projectInfo();
}
