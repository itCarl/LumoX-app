// OutputPatchService — the per-universe DMX output patch and the live-gating that
// decides which universes actually transmit each tick. Owns:
//   - the output patch (one Art-Net / sACN output per universe), persisted per project
//   - the live programmer (manual LIVE-mode output) + its engaged channels
//   - broadcast gating: subscribe only "live" universes, with a release linger so a
//     released universe's mixed-down 0 frame actually reaches the nodes
//   - the shutdown blackout that darkens fixtures before the sockets close
//
// The engine stays transport-agnostic; this maps the show's universes to outputs.

import { engine, show } from '../context';
import { DMX_CHANNELS } from '../../src/index';
import type { Output, Universe, FrameMode } from '../../src/index';
import { seedVirtualDimmers } from './FixtureMaps';

// Sentinel universe id an output subscribes to when its universe is gated off —
// an empty subscription set would otherwise mean "all".
export const NO_UNIVERSE = -1;

// ---- per-universe output patch -----------------------------------------
// Each universe can have ONE output: its protocol (Art-Net / sACN), target IP,
// frame mode and rate cap. The patch is persisted PER PROJECT (ProjectService
// `devices`). The map is the source of truth for which universe an output belongs
// to (its runtime `subscribedUniverses` is toggled by `updateActiveUniverses` for
// live-gating).

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

/** Universes that currently have at least one fixture patched into them. An
 *  output exists only for these — outputs follow the patch, never empty universes. */
const patchedUniverses = (): Set<number> => new Set(show.patch.list().map((fx) => fx.universeId));

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

/** Replace the whole output patch (project load / new / seed). Only universes
 *  that have a fixture patched into them get an output — configs for empty
 *  universes (e.g. stale entries in an old project's `devices`) are dropped. */
export function applyOutputPatch(configs: UniverseOutputConfig[]): void {
  for (const o of engine.outputs.list()) engine.outputs.remove(o.id);
  outputsByUniverse.clear();
  const patched = patchedUniverses();
  for (const cfg of configs) if (patched.has(cfg.universeId)) setUniverseOutput(cfg);
  updateActiveUniverses();
}

/** Seed a default output for every patched universe from the global DMX defaults
 *  (used by a blank/demo project that ships no saved per-universe outputs). A
 *  universe with no fixtures gets no output. */
export function seedDefaultOutputs(defaults: { protocol: string; host: string; maxRateHz: number }): void {
  applyOutputPatch([...patchedUniverses()].sort((a, b) => a - b).map((universeId) => ({
    universeId, protocol: defaults.protocol, host: defaults.host,
    frameMode: 'standard' as FrameMode, maxRateHz: defaults.maxRateHz, enabled: true,
  })));
}

/** Close outputs for universes that no longer have any fixture patched (called
 *  after unpatching / moving fixtures). Keeps the output patch tracking the rig. */
export function pruneUnusedOutputs(): void {
  const patched = patchedUniverses();
  let changed = false;
  for (const universeId of [...outputsByUniverse.keys()]) {
    if (!patched.has(universeId)) { removeUniverseOutput(universeId); changed = true; }
  }
  if (changed) updateActiveUniverses();
}

/** Ensure a universe has an output, creating a default (enabled) one if missing.
 *  Called when a fixture is patched into a universe that has none yet, so the
 *  Connection patch shows it as a real, transmitting output — not a disabled
 *  placeholder. No-op if the universe already has an output. */
export function ensureUniverseOutput(universeId: number, defaults: { protocol: string; host: string; maxRateHz: number }): void {
  if (outputsByUniverse.has(universeId)) return;
  setUniverseOutput({
    universeId, protocol: defaults.protocol, host: defaults.host,
    frameMode: 'standard', maxRateHz: defaults.maxRateHz, enabled: true,
  });
}

// ---- live programmer (LIVE mode) ----------------------------------------
// A universe is "live" while its programmer buffer holds any non-zero wire byte;
// `markLiveUniverse` re-evaluates that after each manual write so released
// channels stop transmitting.
export const liveUniverses = new Set<number>();

/**
 * Re-evaluate whether a universe carries live manual output and refresh the
 * broadcast subscription. Call after any write to a universe's programmer
 * buffer (fader editor LIVE mode).
 */
export function markLiveUniverse(universeId: number): void {
  const u = engine.universes.get(universeId);
  // Only the wire channels count — virtual dimmers (seeded full above DMX_CHANNELS)
  // never transmit, so they must not flag a universe as live on their own.
  if (u && u.programmer.subarray(0, DMX_CHANNELS).some((b) => b !== 0)) liveUniverses.add(universeId);
  else liveUniverses.delete(universeId);
  updateActiveUniverses();
}

/**
 * Clear the live manual programmer across every universe (fader-editor "Clear").
 * Zeroes each programmer buffer; BaseLayer copies programmer → data next tick, so
 * untouched channels stop transmitting once no scene drives them. Virtual dimmers
 * are re-seeded to full so a cleared RGB-only fixture still shows colour at 100%.
 */
export function clearProgrammer(): void {
  for (const u of engine.universes.list()) u.fillProgrammer(0);
  seedVirtualDimmers();
  for (const u of engine.universes.list()) markLiveUniverse(u.id);   // re-evaluates liveUniverses + broadcast subscription
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

// ---- broadcast gating + release linger ----------------------------------
// A universe that just stopped being live is kept subscribed for a short grace
// window so its mixed-down 0 frame actually transmits. Without this the universe
// is dropped from the broadcast the instant it goes idle, before any 0 is sent,
// and the nodes latch their last value (lights stay on). A controller that outputs
// continuously always sends a released channel's 0 — this mirrors that.
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
export function tickReleaseLinger(deltaMs: number): void {
  if (!lingerMs.size) return;
  let expired = false;
  for (const [u, ms] of lingerMs) {
    if (ms - deltaMs <= 0) { lingerMs.delete(u); expired = true; }
    else lingerMs.set(u, ms - deltaMs);
  }
  if (expired) updateActiveUniverses();
}

// ---- shutdown blackout --------------------------------------------------
// On quit, simply closing the sockets stops transmission but leaves the nodes
// latched on their last frame (lights stay on). So before closing we force a 0
// frame to every output. The transport is lossy UDP over WiFi to ESP32 nodes, so
// send it a few times, spaced out, to survive a dropped packet.
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
