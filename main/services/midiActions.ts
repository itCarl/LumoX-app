// MIDI Action registry — the single, typed vocabulary of things a MIDI control
// can do, shared by the executor dispatch AND the mappings UI (it computes each
// binding's live label + kind from here, so labels never go stale).
//
// Guiding rule (see docs/knowledge-base/midi.md): a MIDI message never knows what
// a scene is. It carries an Action *reference* — `{ key, params }`, e.g.
// `{ key:'scene.recall', params:{ sceneId } }` — and the action's executor runs
// the SAME engine path the UI uses (`recallScene`, `grandMaster`, `blackout`, …).
// So hardware behaves exactly like clicking, and one place owns every operation.
//
// Each action is `{ key, label, kind, min?, max? }` plus the closures that run it,
// resolve its target, describe it live, and report its active state. Triggers fire
// on press (toggle/flash); ranges receive a value already mapped to [min,max].
// Adding an action = add one entry to ACTIONS (+ a `parseDescriptor` case so a
// `data-midi` tag can reference it).

import { engine, show } from '../context';
import { recallScene } from './SceneOrchestrator';
import { markLiveUniverse, clearProgrammer } from './OutputPatchService';
import { transport } from './Transport';

export type MidiActionKind = 'trigger' | 'range';

/** A binding's pointer at one action + the show object it targets. Persisted. */
export interface MidiActionRef {
  key: string;                          // an ACTIONS key, e.g. 'scene.recall'
  params: Record<string, string>;       // { sceneId } / { groupId } / { fixtureId, channel } / {}
}

/** Catalog entry surfaced to the UI (one row of the shared vocabulary). */
export interface MidiActionInfo { key: string; label: string; kind: MidiActionKind; min?: number; max?: number; }

type Params = Record<string, string>;

interface MidiActionDef {
  key: string;
  label: string;                        // generic action name (catalog)
  kind: MidiActionKind;
  min?: number;                         // default range bounds (range actions)
  max?: number;
  /** Does the targeted show object still exist? (drops the binding on load if not.) */
  resolves(p: Params): boolean;
  /** Live, show-aware label for the mappings table (e.g. "Scene: Red"). */
  describe(p: Params): string;
  /** Trigger executor — `on` = press/release, `mode` = toggle|flash, `bindingId`
   *  identifies this binding (used by latched actions like group flash). */
  run?(p: Params, on: boolean, mode: 'toggle' | 'flash', bindingId: string): void;
  /** Range executor — `value` is already mapped into [min,max]. */
  apply?(p: Params, value: number): void;
  /** Feedback: is this binding's target currently "on"? (lit LED + UI dot.) */
  active?(p: Params, bindingId: string): boolean;
  /** Release any held runtime state when the binding is removed/reloaded. */
  cleanup?(bindingId: string): void;
}

// ---- runtime state owned by stateful actions ----------------------------
const flashed = new Map<string, { uid: number; addr: number }[]>();   // group.flash latch, by binding id
let taps: number[] = [];                                               // tempo.tap timestamps
const BPM_MIN = 40, BPM_MAX = 240;

/** Universe-absolute intensity addresses of a group's member fixtures. */
function groupIntensityAddrs(gid: string): { uid: number; addr: number }[] {
  const g = show.groups.get(gid);
  if (!g) return [];
  const out: { uid: number; addr: number }[] = [];
  for (const fx of g.fixtures(show.patch)) {
    const addr = fx.addressOf('intensity') || fx.addressOf('intensity-master');
    if (addr) out.push({ uid: fx.universeId, addr });
  }
  return out;
}

/** Momentary "flash group to full": engage every member's intensity to 255 while
 *  held (flash) / latched (toggle), release on the way out (back to scene/base). */
function groupFlash(bindingId: string, gid: string, on: boolean, mode: 'toggle' | 'flash'): void {
  const lit = flashed.has(bindingId);
  const wantOn = mode === 'flash' ? on : (on ? !lit : lit);   // toggle flips on press; flash follows hold
  if (wantOn === lit) return;
  if (wantOn) {
    const addrs = groupIntensityAddrs(gid);
    for (const { uid, addr } of addrs) engine.universes.get(uid)?.engage(addr, 255);
    flashed.set(bindingId, addrs);
    for (const uid of new Set(addrs.map((a) => a.uid))) markLiveUniverse(uid);
  } else {
    const addrs = flashed.get(bindingId) ?? [];
    for (const { uid, addr } of addrs) engine.universes.get(uid)?.release(addr);
    flashed.delete(bindingId);
    for (const uid of new Set(addrs.map((a) => a.uid))) markLiveUniverse(uid);
  }
}

/** Average recent tap gaps → master BPM (only while the tempo source is manual;
 *  an external clock owns the tempo otherwise). Mirrors the title-bar TAP. */
function tap(): void {
  if (transport.getSource() !== 'manual') return;
  const now = Date.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];   // >2 s pause → fresh
  taps.push(now);
  if (taps.length > 6) taps.shift();
  if (taps.length < 2) return;
  let sum = 0;
  for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
  transport.setBpm(Math.round(60000 / (sum / (taps.length - 1))));
}

/** Resolve "fixture local channel index" → a universe-absolute address (real
 *  channels 1..count, then this fixture's virtual dimmers above the count). */
function channelAddr(fixtureId: string, ch: number): { uid: number; addr: number } | null {
  const fx = show.patch.get(fixtureId);
  if (!fx) return null;
  let abs = 0;
  if (ch >= 1 && ch <= fx.channelCount) abs = fx.startAddress + ch - 1;
  else abs = fx.virtualDimmers()[ch - fx.channelCount - 1]?.virtualAddr ?? 0;
  return abs ? { uid: fx.universeId, addr: abs } : null;
}

function channelLabel(fixtureId: string, ch: number): string {
  const fx = show.patch.get(fixtureId);
  if (!fx) return '—';
  const name = ch <= fx.channelCount ? (fx.mode.channels[ch - 1]?.name ?? `Ch ${ch}`) : 'Virtual dimmer';
  return `${fx.name} · ${name}`;
}

// ---- the catalog --------------------------------------------------------
const DEFS: MidiActionDef[] = [
  {
    key: 'scene.recall', label: 'Recall scene', kind: 'trigger',
    resolves: (p) => !!show.scenes.get(p.sceneId),
    describe: (p) => `Scene: ${show.scenes.get(p.sceneId)?.name ?? '—'}`,
    run: (p, on, mode) => {
      if (mode === 'flash') recallScene(p.sceneId, on);
      else if (on) recallScene(p.sceneId, !engine.scenes.isLive(p.sceneId));
    },
    active: (p) => engine.scenes.isLive(p.sceneId),
  },
  {
    key: 'group.flash', label: 'Flash group to full', kind: 'trigger',
    resolves: (p) => !!show.groups.get(p.groupId),
    describe: (p) => `Group flash: ${show.groups.get(p.groupId)?.name ?? '—'}`,
    run: (p, on, mode, bindingId) => groupFlash(bindingId, p.groupId, on, mode),
    active: (_p, bindingId) => flashed.has(bindingId),
    cleanup: (bindingId) => groupFlash(bindingId, '', false, 'flash'),
  },
  {
    key: 'blackout.toggle', label: 'Blackout', kind: 'trigger',
    resolves: () => true,
    describe: () => 'Blackout',
    run: (_p, on, mode) => { if (mode === 'flash') engine.blackout.set(on); else if (on) engine.blackout.toggle(); },
    active: () => engine.blackout.active,
  },
  {
    key: 'tempo.tap', label: 'Tap tempo', kind: 'trigger',
    resolves: () => true,
    describe: () => 'Tap tempo',
    run: (_p, on) => { if (on) tap(); },
  },
  {
    key: 'programmer.clear', label: 'Clear programmer', kind: 'trigger',
    resolves: () => true,
    describe: () => 'Clear programmer',
    run: (_p, on) => { if (on) clearProgrammer(); },
  },
  {
    key: 'master.level', label: 'GrandMaster', kind: 'range', min: 0, max: 1,
    resolves: () => true,
    describe: () => 'GrandMaster',
    apply: (_p, value) => engine.grandMaster.setValue(value),
  },
  {
    key: 'group.level', label: 'Group intensity', kind: 'range', min: 0, max: 255,
    resolves: (p) => !!show.groups.get(p.groupId),
    describe: (p) => `Group: ${show.groups.get(p.groupId)?.name ?? '—'}`,
    apply: (p, value) => {
      const g = show.groups.get(p.groupId);
      if (!g) return;
      g.setIntensity(show.patch, Math.round(value));
      g.apply(show.patch, engine.universes);
      for (const fx of g.fixtures(show.patch)) markLiveUniverse(fx.universeId);
    },
  },
  {
    key: 'channel.level', label: 'Channel level', kind: 'range', min: 0, max: 255,
    resolves: (p) => !!show.patch.get(p.fixtureId),
    describe: (p) => channelLabel(p.fixtureId, Number(p.channel)),
    apply: (p, value) => {
      const at = channelAddr(p.fixtureId, Number(p.channel));
      if (!at) return;
      const u = engine.universes.get(at.uid);
      if (u) { u.engage(at.addr, Math.max(0, Math.min(255, Math.round(value)))); markLiveUniverse(at.uid); }
    },
  },
  {
    key: 'tempo.bpm', label: 'Tempo (BPM)', kind: 'range', min: BPM_MIN, max: BPM_MAX,
    resolves: () => true,
    describe: () => 'Tempo (BPM)',
    apply: (_p, value) => { if (transport.getSource() === 'manual') transport.setBpm(Math.round(value)); },
  },
];

const BY_KEY = new Map(DEFS.map((d) => [d.key, d]));

// ---- public API (used by MidiService) -----------------------------------
export function actionInfo(key: string): MidiActionInfo | null {
  const d = BY_KEY.get(key);
  return d ? { key: d.key, label: d.label, kind: d.kind, min: d.min, max: d.max } : null;
}

export const actionKind = (key: string): MidiActionKind | null => BY_KEY.get(key)?.kind ?? null;
export const actionResolves = (ref: MidiActionRef): boolean => BY_KEY.get(ref.key)?.resolves(ref.params) ?? false;
export const actionDescribe = (ref: MidiActionRef): string => BY_KEY.get(ref.key)?.describe(ref.params) ?? ref.key;
export const actionActive = (ref: MidiActionRef, bindingId: string): boolean =>
  BY_KEY.get(ref.key)?.active?.(ref.params, bindingId) ?? false;

export function runTrigger(ref: MidiActionRef, on: boolean, mode: 'toggle' | 'flash', bindingId: string): void {
  BY_KEY.get(ref.key)?.run?.(ref.params, on, mode, bindingId);
}
export function applyRange(ref: MidiActionRef, value: number): void {
  BY_KEY.get(ref.key)?.apply?.(ref.params, value);
}
export function cleanupBinding(ref: MidiActionRef, bindingId: string): void {
  BY_KEY.get(ref.key)?.cleanup?.(bindingId);
}

/** Compact `data-midi` descriptor (the DOM wire format) → an action reference.
 *  This is the ONE place those short strings are decoded. */
export function parseDescriptor(d: string): MidiActionRef | null {
  if (!d) return null;
  if (d === 'master')           return { key: 'master.level', params: {} };
  if (d === 'blackout')         return { key: 'blackout.toggle', params: {} };
  if (d === 'bpm-tap')          return { key: 'tempo.tap', params: {} };
  if (d === 'bpm-set')          return { key: 'tempo.bpm', params: {} };
  if (d === 'programmer-clear') return { key: 'programmer.clear', params: {} };
  if (d.startsWith('scene:'))   return { key: 'scene.recall', params: { sceneId: d.slice(6) } };
  if (d.startsWith('group:') && d.endsWith(':intensity'))
    return { key: 'group.level', params: { groupId: d.slice(6, -':intensity'.length) } };
  if (d.startsWith('group:') && d.endsWith(':flash'))
    return { key: 'group.flash', params: { groupId: d.slice(6, -':flash'.length) } };
  if (d.startsWith('fixture:')) {
    const rest = d.slice('fixture:'.length);
    const sep = rest.lastIndexOf(':');
    if (sep < 0) return null;
    return { key: 'channel.level', params: { fixtureId: rest.slice(0, sep), channel: rest.slice(sep + 1) } };
  }
  return null;
}
