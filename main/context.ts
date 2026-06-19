// App context — the single engine/show/bank instances and the small domain
// helpers shared across IPC handler modules. The main process has exactly one
// of each, so these are module singletons rather than a passed-around object.

import { Engine, Show, BankManager, Scene, DiscoveryService } from '../src/index';
import type { Output, Universe, FrameMode, Fixture, FxTargetSel, FxOrder, FxKind, Vec2, FixtureLimitTargets, AxisLimitTarget, LimitMap } from '../src/index';
import type { MixerTrack } from '../src/show/Scene';

export const engine = new Engine({ refreshHz: 44 });
export const show = new Show({ name: 'Untitled' });
export const banks = new BankManager();

// Network node discovery (Art-Net ArtPoll). Runtime-only — started/stopped by the
// Connection tab while it's visible; never persisted. See main/handlers/discovery.ts.
export const discovery = new DiscoveryService();

// Sentinel universe id an output subscribes to when its universe is gated off —
// an empty subscription set would otherwise mean "all".
export const NO_UNIVERSE = -1;

// ---- per-universe output patch -----------------------------------------
// Each universe can have ONE output: its protocol (Art-Net / sACN), target IP,
// frame mode and rate cap. Replaces the old single global "Broadcast" output.
// The patch is persisted PER PROJECT (ProjectService `devices`). The map is the
// source of truth for which universe an output belongs to (its runtime
// `subscribedUniverses` is toggled by `updateActiveUniverses` for live-gating).

/** Per-universe output config — the persisted + engine-facing shape. */
export interface UniverseOutputConfig {
  universeId: number;
  protocol: string;        // 'artnet' | 'sacn'
  host: string;
  frameMode: FrameMode;
  maxRateHz: number;
  enabled: boolean;
}

const outputsByUniverse = new Map<number, Output>();

export const outputForUniverse = (universeId: number): Output | undefined => outputsByUniverse.get(universeId);

/** Stable per-universe configs (from the map, not the runtime subscription) —
 *  for persistence (`buildProject`) and the Connection UI. */
export function savedOutputs(): UniverseOutputConfig[] {
  const list: UniverseOutputConfig[] = [];
  for (const [universeId, o] of outputsByUniverse) {
    list.push({
      universeId, protocol: o.type,
      host: (o as { host?: string | null }).host ?? '',
      frameMode: o.frameMode, maxRateHz: o.maxRateHz ?? 40, enabled: o.enabled,
    });
  }
  return list.sort((a, b) => a.universeId - b.universeId);
}

/** Create / update the output for one universe. Recreates the socket only when
 *  the protocol changes; otherwise updates it in place. Opens in the background. */
export function setUniverseOutput(cfg: UniverseOutputConfig): void {
  const existing = outputsByUniverse.get(cfg.universeId);
  if (existing && existing.type === cfg.protocol) {
    if (cfg.protocol === 'artnet') (existing as { host?: string }).host = cfg.host;
    existing.enabled = cfg.enabled;
    existing.setMaxRate(cfg.maxRateHz);
    existing.setFrameMode(cfg.frameMode);
  } else {
    if (existing) engine.outputs.remove(existing.id);   // protocol changed → new socket
    const out = engine.outputs.create(cfg.protocol, {
      name: `Universe ${cfg.universeId + 1}`,
      ...(cfg.protocol === 'artnet' ? { host: cfg.host } : {}),
      maxRateHz: cfg.maxRateHz,
      frameMode: cfg.frameMode,
      enabled: cfg.enabled,
      subscribedUniverses: [cfg.universeId],
    });
    outputsByUniverse.set(cfg.universeId, out);
    out.open().catch((err) => console.error(`[show] universe ${cfg.universeId} output:`, (err as Error).message));
  }
  updateActiveUniverses();
}

/** Drop the output for one universe (closes its socket). */
export function removeUniverseOutput(universeId: number): void {
  const o = outputsByUniverse.get(universeId);
  if (!o) return;
  engine.outputs.remove(o.id);
  outputsByUniverse.delete(universeId);
}

/** Replace the whole output patch (project load / new / seed). */
export function applyOutputPatch(configs: UniverseOutputConfig[]): void {
  for (const o of engine.outputs.list()) engine.outputs.remove(o.id);
  outputsByUniverse.clear();
  for (const cfg of configs) setUniverseOutput(cfg);
  updateActiveUniverses();
}

/** Seed a default output for every engine universe from the global DMX defaults
 *  (used by a blank/demo project that ships no saved per-universe outputs). */
export function seedDefaultOutputs(defaults: { protocol: string; host: string; maxRateHz: number }): void {
  applyOutputPatch(engine.universes.list().map((u) => ({
    universeId: u.id, protocol: defaults.protocol, host: defaults.host,
    frameMode: 'standard' as FrameMode, maxRateHz: defaults.maxRateHz, enabled: true,
  })));
}

// ---- shutdown blackout --------------------------------------------------
// On quit, simply closing the sockets stops transmission but leaves the nodes
// latched on their last frame (lights stay on — see RELEASE_LINGER_MS below).
// So before closing we force a 0 frame to every output. The transport is lossy
// UDP over WiFi to ESP32 nodes, so send it a few times, spaced out, to survive
// a dropped packet.
const SHUTDOWN_BLACKOUT_FRAMES = 3;
const SHUTDOWN_BLACKOUT_SPACING_MS = 30;
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Blackout every open output before its socket closes, so fixtures go dark
 * instead of holding their last values. Zeroes each universe and transmits the
 * frame directly via `Output.blackout` (bypassing live-gating / dirty / rate
 * caps — an idle universe is gated off and would otherwise never send the 0).
 * Call with the engine tick already stopped so nothing competes for the socket.
 * Best-effort: never throws.
 */
export async function blackoutAllOutputs(): Promise<void> {
  const pairs: Array<[Universe, Output]> = [];
  for (const [universeId, out] of outputsByUniverse) {
    const u = engine.universes.get(universeId);
    if (u && out.isOpen) { u.data.fill(0); pairs.push([u, out]); }
  }
  if (!pairs.length) return;
  for (let i = 0; i < SHUTDOWN_BLACKOUT_FRAMES; i++) {
    for (const [u, out] of pairs) out.blackout(u);
    if (i < SHUTDOWN_BLACKOUT_FRAMES - 1) await delay(SHUTDOWN_BLACKOUT_SPACING_MS);
  }
}

/** Highest universe id supported by the default Art-Net port-address mapping
 *  (net 0 / subnet 0 → 16 universes). Bounds the Connection tab's "add universe". */
export const MAX_UNIVERSES = 16;

/** Append a new universe (next free id) with a default output. Returns its id,
 *  or -1 if the cap is reached. */
export function addUniverse(defaults: { protocol: string; host: string; maxRateHz: number }): number {
  const ids = engine.universes.list().map((u) => u.id);
  if (ids.length >= MAX_UNIVERSES) return -1;
  const id = ids.length ? Math.max(...ids) + 1 : 0;
  engine.universes.ensure(id, `Universe ${id + 1}`);
  setUniverseOutput({
    universeId: id, protocol: defaults.protocol, host: defaults.host,
    frameMode: 'standard', maxRateHz: defaults.maxRateHz, enabled: true,
  });
  return id;
}

// Universes under live manual control (LIVE mode). A universe is "live" while
// its programmer buffer holds any non-zero byte; `markLiveUniverse` re-evaluates
// that after each manual write so released channels stop transmitting.
export const liveUniverses = new Set<number>();

/**
 * Re-evaluate whether a universe carries live manual output and refresh the
 * broadcast subscription. Call after any write to a universe's programmer
 * buffer (fader editor LIVE mode).
 */
export function markLiveUniverse(universeId: number): void {
  const u = engine.universes.get(universeId);
  if (u && u.programmer.some((b) => b !== 0)) liveUniverses.add(universeId);
  else liveUniverses.delete(universeId);
  updateActiveUniverses();
}

/**
 * Clear the live manual programmer across every universe (fader-editor "Clear").
 * Zeroes each programmer buffer; BaseLayer copies programmer → data next tick, so
 * untouched channels stop transmitting once no scene drives them.
 */
export function clearProgrammer(): void {
  for (const u of engine.universes.list()) {
    u.fillProgrammer(0);
    markLiveUniverse(u.id);   // re-evaluates liveUniverses + broadcast subscription
  }
}

/** Summary of the live programmer — count of engaged channels + which universes.
 *  Counts the `engaged` mask (manually-moved faders), not raw non-zero bytes, so
 *  fixture defaults flushed into the programmer at patch time aren't included. */
export function programmerSummary(): { channels: number; universes: number[] } {
  let channels = 0;
  const universes: number[] = [];
  for (const u of engine.universes.list()) {
    let n = 0;
    for (let i = 0; i < u.engaged.length; i++) if (u.engaged[i]) n++;
    if (n) { channels += n; universes.push(u.id); }
  }
  return { channels, universes };
}

// Release linger — a universe that just stopped being live is kept subscribed for
// a short grace window so its mixed-down 0 frame actually transmits. Without this
// the universe is dropped from the broadcast the instant it goes idle, before any
// 0 is sent, and the nodes latch their last value (lights stay on). QLC+ outputs
// continuously, so a released channel's 0 is always sent — this mirrors that.
const RELEASE_LINGER_MS = 1200;
const lingerMs = new Map<number, number>();   // universeId → ms remaining
let prevLive = new Set<number>();              // live set at the last refresh

/** Universes that currently carry output — active scenes + live manual programmer. */
function liveSet(): Set<number> {
  const set = new Set<number>(liveUniverses);
  for (const s of show.listScenes()) {
    // `isLive` keeps a fading-in scene subscribed before its opacity rises and
    // a fading-out scene subscribed until it settles to 0.
    if (engine.scenes.isLive(s.id)) for (const uid of Object.keys(s.values)) set.add(Number(uid));
  }
  return set;
}

/** Re-gate each per-universe output. Continuous modes (full / partial) always
 *  transmit their universe; `standard` transmits only while the universe is live
 *  (active scene or manual programmer) plus a short release linger. Gating toggles
 *  the runtime subscription between [universeId] and the NO_UNIVERSE sentinel
 *  (an empty set would mean "all"). */
export function updateActiveUniverses(): void {
  const live = liveSet();
  for (const u of prevLive) if (!live.has(u)) lingerMs.set(u, RELEASE_LINGER_MS);  // just released → linger
  for (const u of live) lingerMs.delete(u);                                        // live again → cancel linger
  prevLive = live;

  for (const [uid, out] of outputsByUniverse) {
    const continuous = out.frameMode !== 'standard';
    const on = out.enabled && (continuous || live.has(uid) || lingerMs.has(uid));
    out.subscribedUniverses = new Set([on ? uid : NO_UNIVERSE]);
  }
}

/** Count down release-linger each tick; drop a universe once its 0 has flushed. */
function tickReleaseLinger(deltaMs: number): void {
  if (!lingerMs.size) return;
  let expired = false;
  for (const [u, ms] of lingerMs) {
    if (ms - deltaMs <= 0) { lingerMs.delete(u); expired = true; }
    else lingerMs.set(u, ms - deltaMs);
  }
  if (expired) updateActiveUniverses();
}

// Group palette — each new group gets a distinct colour; its fixtures inherit it.
const GROUP_COLORS = [
  '#e0564b', '#e08a3b', '#e0c44b', '#8ec44b', '#4bc49a',
  '#4ba6e0', '#6b7ce0', '#9c5be0', '#e04bb0', '#5bd0e0',
];
let colorCursor = 0;
export const nextColor = (): string => GROUP_COLORS[colorCursor++ % GROUP_COLORS.length];

// Channel-config identity — fixtures with the same definition + mode share a
// layout and may be grouped together; different configs may not.
export const configKey = (fx: Fixture): string => `${fx.definition.id}::${fx.mode.id}`;

/** Do all fixture ids share one channel-config? (group membership constraint) */
export function sameConfig(ids: string[]): boolean {
  const keys = new Set<string>();
  for (const id of ids) {
    const f = show.patch.get(id);
    if (f) keys.add(configKey(f));
  }
  return keys.size <= 1;
}

// ---- live programmer selection -----------------------------------------
// The transient, ordered "programming target": fixture ids in selection order
// (1-based to the user). Any FX layer whose target is {mode:'selection'} fans
// across this pick instead of raw patch order, so a rainbow scrolls and a
// movement fans in the order the user selected. Runtime-only — never persisted
// (like the programmer); pruned to currently-patched fixtures on read.

let selection: string[] = [];
const patched = (id: string): boolean => !!show.patch.get(id);

/** The active selection, pruned to patched fixtures, in selection order. */
export const getSelection = (): string[] => selection.filter(patched);

/** Replace the selection (kept in the given order, deduped + pruned), then
 *  refresh any live scene whose FX targets the selection. */
export function setSelection(ids: string[]): string[] {
  const seen = new Set<string>();
  selection = ids.filter((id) => patched(id) && !seen.has(id) && (seen.add(id), true));
  rebuildSelectionTracks();
  return selection;
}

/** Patch-order id list — the candidate universe for invert / every-Nth / shift. */
const patchOrder = (): string[] => show.patch.list().map((f) => f.id);

/** Quick-select / reorder ops over the active selection. Each computes the new
 *  ordered selection (some against the whole patch), stores it, and returns it. */
export function selectionOp(
  op: 'all' | 'invert' | 'reverse' | 'mirror' | 'everyNth' | 'shift' | 'reorder',
  arg: { n?: number; offset?: number; delta?: number; from?: number; to?: number } = {},
): string[] {
  const cur = getSelection();
  let next = cur;
  switch (op) {
    case 'all': next = patchOrder(); break;
    case 'invert': { const set = new Set(cur); next = patchOrder().filter((id) => !set.has(id)); break; }
    case 'reverse': next = [...cur].reverse(); break;
    case 'mirror': {                                   // centre-out reorder (fan from middle)
      const c = (cur.length - 1) / 2;
      next = cur.map((_, i) => i).sort((a, b) => Math.abs(a - c) - Math.abs(b - c)).map((i) => cur[i]);
      break;
    }
    case 'everyNth': {                                 // thin to every n-th, from offset
      const n = Math.max(1, arg.n ?? 2), off = arg.offset ?? 0;
      next = cur.filter((_, i) => i >= off && (i - off) % n === 0);
      break;
    }
    case 'shift': {                                    // step each pick ±d in patch order (wraps)
      const order = patchOrder(), N = order.length;
      if (!N) { next = []; break; }
      const d = arg.delta ?? 1, seen = new Set<string>(), out: string[] = [];
      for (const id of cur) {
        const i = order.indexOf(id); if (i < 0) continue;
        const nid = order[(((i + d) % N) + N) % N];
        if (!seen.has(nid)) { seen.add(nid); out.push(nid); }
      }
      next = out; break;
    }
    case 'reorder': {                                  // drag row from→to within the selection
      next = [...cur];
      const { from = 0, to = 0 } = arg;
      if (from >= 0 && from < next.length && to >= 0 && to < next.length) {
        const [m] = next.splice(from, 1); next.splice(to, 0, m);
      }
      break;
    }
  }
  return setSelection(next);
}

/** Rebuild every live scene that drives the selection so a selection change
 *  re-fans its effects immediately (opacity + phase preserved). */
export function rebuildSelectionTracks(): void {
  for (const s of show.listScenes()) {
    if (s.layers.some((L) => L.target.mode === 'selection')) rebuildSceneTrack(s);
  }
}

// ---- per-fixture output limits ------------------------------------------
// Resolve each fixture's authoring limits (`fx.limits`, in coarse DMX) to the
// absolute addresses the engine's Limits post-stage clamps/shapes. The engine
// stays fixture-agnostic; this is the one place the patch is consulted for it.
// Call `rebuildLimits()` after any patch or limits change.

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function axisTarget(fx: Fixture, attr: 'pan' | 'tilt', lim: { min: number; max: number; invert?: boolean }): AxisLimitTarget | undefined {
  const addr = fx.addressOf(attr);
  if (!addr) return undefined;
  const min = clampByte(lim.min), max = clampByte(lim.max);
  return { addr, fine: fx.fineAddressOf(attr), min: Math.min(min, max), max: Math.max(min, max), invert: !!lim.invert };
}

function buildLimitMap(): LimitMap {
  const map: LimitMap = new Map();
  for (const f of show.patch.list()) {
    const lim = f.limits;
    const e: FixtureLimitTargets = {};
    if (lim?.dimmer) { const addrs = f.intensityAddresses(); if (addrs.length) e.dimmer = { addrs, max: clampByte(lim.dimmer.max) }; }
    if (lim?.pan)  { const t = axisTarget(f, 'pan', lim.pan);   if (t) e.pan = t; }
    if (lim?.tilt) { const t = axisTarget(f, 'tilt', lim.tilt); if (t) e.tilt = t; }
    if (lim?.swapPanTilt) {
      const pan = f.addressOf('pan'), tilt = f.addressOf('tilt');
      if (pan && tilt) e.swap = { pan, panFine: f.fineAddressOf('pan'), tilt, tiltFine: f.fineAddressOf('tilt') };
    }
    // follows-dimmer flags → scale those channels by the fixture's mixed dimmer
    if (f.channelFlags) {
      const dimAddr = f.intensityAddresses()[0] ?? 0;
      const intens = new Set(f.intensityAddresses());
      const addrs: number[] = [];
      for (const [idx, flag] of Object.entries(f.channelFlags)) {
        const addr = f.startAddress + Number(idx) - 1;
        if (flag?.dimmer && dimAddr && !intens.has(addr)) addrs.push(addr);
      }
      if (addrs.length) e.follows = { addrs, dim: dimAddr };
    }
    if (e.dimmer || e.pan || e.tilt || e.swap || e.follows) (map.get(f.universeId) ?? map.set(f.universeId, []).get(f.universeId)!).push(e);
  }
  return map;
}

/** Per-universe snap mask (512-byte 0/1) — channels flagged `fade:false` jump on
 *  scene crossfades instead of interpolating. */
function buildSnapMask(): Map<number, Uint8Array> {
  const masks = new Map<number, Uint8Array>();
  for (const f of show.patch.list()) {
    if (!f.channelFlags) continue;
    for (const [idx, flag] of Object.entries(f.channelFlags)) {
      if (flag?.fade !== false) continue;   // default (absent/true) = fades
      const addr = f.startAddress + Number(idx) - 1;
      const m = masks.get(f.universeId) ?? masks.set(f.universeId, new Uint8Array(512)).get(f.universeId)!;
      if (addr >= 1 && addr <= 512) m[addr - 1] = 1;
    }
  }
  return masks;
}

/** Re-resolve every fixture's limits + channel flags into the engine modules. */
export function rebuildLimits(): void {
  engine.limits.setMap(buildLimitMap());
  engine.scenes.setSnapMask(buildSnapMask());
}

// ---- scene tracks & recall ---------------------------------------------

/** Fixtures an FX layer targets — the rig (patch order), a group (membership
 *  order), or the live programmer selection (selection order). */
function fixturesFor(sel: FxTargetSel): Fixture[] {
  if (sel.mode === 'group') {
    const g = show.groups.list().find((x) => x.id === sel.groupId);
    return g ? g.fixtures(show.patch) : [];
  }
  if (sel.mode === 'selection') {
    return getSelection().map((id) => show.patch.get(id)).filter((f): f is Fixture => !!f);
  }
  return show.patch.list();
}

/** Deterministic 0..1 from an index (stable shuffle for FxOrder 'random'). */
const orderHash = (i: number): number => { const s = Math.sin((i + 1) * 127.1) * 43758.5453; return s - Math.floor(s); };

/** Reorder fixtures to realise an FX sweep order (the per-fixture "index"). */
function orderFixtures(fxs: Fixture[], order: FxOrder): Fixture[] {
  const n = fxs.length;
  if (n <= 1 || order === 'patch') return fxs;
  const idx = fxs.map((_, i) => i);
  if (order === 'reverse') idx.reverse();
  else if (order === 'mirror') { const c = (n - 1) / 2; idx.sort((a, b) => Math.abs(a - c) - Math.abs(b - c)); }   // centre-out
  else if (order === 'random') idx.sort((a, b) => orderHash(a) - orderHash(b));
  return idx.map((i) => fxs[i]);
}

/** Per-universe DMX target addresses for a layer kind, over `fxs` (in order). */
function targetsForKind(kind: FxKind, attr: string, fxs: Fixture[]): Record<number, number[][]> {
  const out: Record<number, number[][]> = {};
  for (const f of fxs) {
    if (kind === 'color') {
      const r = f.addressOf('red'), g = f.addressOf('green'), b = f.addressOf('blue');
      if (r && g && b) (out[f.universeId] ??= []).push([r, g, b]);
    } else if (kind === 'move') {
      const pan = f.addressOf('pan'), tilt = f.addressOf('tilt');
      if (pan && tilt) (out[f.universeId] ??= []).push([pan, tilt]);
    } else {
      // curve / value / chaser → one attribute address (intensity falls back to dimmer)
      const a = f.addressOf(attr) ||
        (attr === 'intensity' ? (f.addressOf('intensity-master') || f.addressOf('dimmer')) : 0);
      if (a) (out[f.universeId] ??= []).push([a]);
    }
  }
  return out;
}

/**
 * MATRIX FX targets — one `[r,g,b(,w)]` tuple per *emitter* (true pixel-map),
 * paired with that emitter's 2D world position. A single-colour fixture
 * contributes one cell (the whole fixture as a pixel); a matrix contributes one
 * per emitter. `targets` + `positions` are index-aligned per universe.
 */
function matrixTargets(fxs: Fixture[]): { targets: Record<number, number[][]>; positions: Record<number, Vec2[]> } {
  const targets: Record<number, number[][]> = {};
  const positions: Record<number, Vec2[]> = {};
  for (const f of fxs) {
    const cells = f.emitterColorAddresses();
    if (!cells.length) continue;
    const worlds = f.emitterWorldPositions();
    const m = Math.min(cells.length, worlds.length);
    const t = (targets[f.universeId] ??= []);
    const p = (positions[f.universeId] ??= []);
    for (let k = 0; k < m; k++) {
      const c = cells[k];
      t.push(c.w != null ? [c.r, c.g, c.b, c.w] : [c.r, c.g, c.b]);
      p.push(worlds[k]);
    }
  }
  return { targets, positions };
}

/**
 * Build a scene's SceneMixer track, attaching each FX layer's patch-derived DMX
 * target addresses (resolved from the layer's group + sweep order). The engine
 * stays fixture-agnostic; this is the one place the patch is consulted. Use
 * everywhere a track is (re)created so layers always carry their current targets.
 */
export function sceneTrack(scene: Scene, opacity = 0): MixerTrack {
  const track = scene.toMixerTrack({ blend: 'htp', opacity });
  if (track.layers) {
    scene.layers.forEach((L, i) => {
      const tl = track.layers![i];
      if (!tl) return;
      const fxs = orderFixtures(fixturesFor(L.target), L.order);
      if (L.kind === 'matrix') {
        const { targets, positions } = matrixTargets(fxs);
        tl.targets = targets;
        tl.positions = positions;
      } else {
        const attr = L.curve?.attr ?? L.value?.attr ?? L.chaser?.attr ?? 'intensity';
        tl.targets = targetsForKind(L.kind, attr, fxs);
      }
    });
  }
  return track;
}

/**
 * Guarantee the first bank always holds at least one scene. When bank 1 is empty
 * it creates a blank static "Scene 1" (show + engine track + bank membership) so
 * the CONTROL view always has a cue to recall, edit, or store into. Idempotent;
 * call after the banks settle (project new / load). Assumes a default bank exists.
 */
export function ensureDefaultScene(): void {
  const first = banks.list()[0];
  if (!first || first.sceneIds.length) return;
  const s = new Scene({ name: 'Scene 1' });
  show.addScene(s);
  engine.scenes.addTrack(sceneTrack(s));
  banks.addScene(first.id, s.id);
}

/**
 * Replace a scene's live track in place, preserving its current opacity AND its
 * playback phase clock — editing FX params (timing / config / targets) must
 * never snap the running animation back to zero. Recall still reseeds the phase
 * per the scene's start mode.
 */
export function rebuildSceneTrack(scene: Scene): void {
  const opacity = engine.scenes.tracks.get(scene.id)?.opacity ?? 0;
  const playback = engine.scenes.playback.get(scene.id);
  engine.scenes.removeTrack(scene.id);
  engine.scenes.addTrack(sceneTrack(scene, opacity));
  if (playback) engine.scenes.playback.set(scene.id, playback);
}

/** Effective fade time in seconds, scaled by the scene's fade-speed multiplier. */
function fadeSeconds(scene: Scene, dir: 'in' | 'out'): number {
  const base = dir === 'in' ? scene.fadeIn : scene.fadeOut;
  return Math.max(0, base) * Math.max(0.01, scene.fadeSpeed);
}

/**
 * Does recalling `actor` release `target`? `actor`'s release mode must cover the
 * target's scope AND the target must not shield itself via protect-from-release.
 * Bank ids are resolved by the caller (null = scene in no bank).
 */
function releases(actor: Scene, actorBank: string | null, target: Scene, targetBank: string | null): boolean {
  return inReleaseScope(actor, actorBank, targetBank) && !isProtected(target, targetBank, actorBank);
}
function inReleaseScope(actor: Scene, actorBank: string | null, targetBank: string | null): boolean {
  switch (actor.releaseMode) {
    case 'off': return false;
    case 'all': return true;
    case 'bank': return actorBank != null && actorBank === targetBank;
    case 'outside-bank': return actorBank !== targetBank;
    case 'specific': return targetBank != null && actor.releaseBanks.includes(targetBank);
  }
}
function isProtected(target: Scene, targetBank: string | null, actorBank: string | null): boolean {
  switch (target.protectFromRelease) {
    case 'off': return false;
    case 'all': return true;
    case 'bank': return targetBank != null && targetBank === actorBank;
    case 'outside-bank': return targetBank !== actorBank;
    case 'specific': return actorBank != null && target.protectBanks.includes(actorBank);
  }
}

/**
 * Recall a scene on/off. On recall it releases every live scene its release mode
 * covers (respecting each target's protect-from-release — the default 'bank'
 * release reproduces "one active scene per bank"), crossfades the target toward
 * its DIMMER `level` over its fade time (instant when fade is 0), seeds the phase
 * clock per the scene's start mode, and refreshes the broadcast subscription.
 */
export function recallScene(id: string, on: boolean): void {
  const scene = show.scenes.get(id);
  if (on) {
    if (scene) {
      const actorBank = banks.bankOf(id)?.id ?? null;
      for (const other of show.listScenes()) {
        if (other.id === id || !engine.scenes.isLive(other.id)) continue;
        const otherBank = banks.bankOf(other.id)?.id ?? null;
        if (releases(scene, actorBank, other, otherBank)) {
          engine.scenes.fadeTo(other.id, 0, fadeSeconds(other, 'out'), other.phaseOut);
        }
      }
      engine.scenes.resetPhase(id, scene.startMode);
      engine.scenes.fadeTo(id, scene.level, fadeSeconds(scene, 'in'), scene.phaseIn);
    } else {
      engine.scenes.fadeTo(id, 1, 0);
    }
  } else {
    engine.scenes.fadeTo(id, 0, scene ? fadeSeconds(scene, 'out') : 0, scene?.phaseOut ?? 0);
  }
  updateActiveUniverses();
}

/** Resolve a counted-loop jump target to a scene id (bank-relative for next/prev). */
function resolveJump(id: string, jump: NonNullable<Scene['jumpTo']>): string | null {
  if (jump.mode === 'scene') return jump.sceneId ?? null;
  const bank = banks.bankOf(id);
  if (!bank || !bank.sceneIds.length) return null;
  const i = bank.sceneIds.indexOf(id);
  if (i < 0) return null;
  const n = bank.sceneIds.length;
  const j = jump.mode === 'next' ? (i + 1) % n : (i - 1 + n) % n;
  return bank.sceneIds[j] ?? null;
}

/**
 * A scene's counted loop just finished. Jump to another scene if `jumpTo` is set;
 * otherwise release the scene (`releaseAtEnd`) or pause it on its final frame.
 */
function handleLoopComplete(id: string): void {
  const s = show.scenes.get(id);
  if (!s) return;
  if (s.jumpTo) {
    const target = resolveJump(id, s.jumpTo);
    recallScene(id, false);
    if (target && target !== id) recallScene(target, true);
  } else if (s.releaseAtEnd) {
    recallScene(id, false);
  } else {
    engine.scenes.pause(id);
  }
  updateActiveUniverses();
}

// Advance scene fades + phase clocks once per tick (the SceneMixer's per-universe
// process() stays a pure reader). When a fade-out settles to 0 the scene stops
// being "live", so drop it from the broadcast subscription.
engine.on('tick', (deltaMs: number) => {
  engine.scenes.update(deltaMs);
  if (engine.scenes.consumeWentInactive().length) updateActiveUniverses();
  for (const id of engine.scenes.consumeCompleted()) handleLoopComplete(id);
  tickReleaseLinger(deltaMs);
});
