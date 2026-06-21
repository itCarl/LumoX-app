import { EventEmitter } from 'node:events';
import { DMX_CHANNELS } from '../core/Universe';
import type { Universe } from '../core/Universe';

/**
 * Common config shape accepted by any Output subclass. Subclasses extend
 * this with their own keys.
 */
export interface OutputConfig {
  id?: string;
  name?: string;
  enabled?: boolean;
  subscribedUniverses?: Iterable<number>;
  /** ms — heartbeat interval to re-send even if not dirty. 0 disables. */
  keepAliveMs?: number;
  /** Hz — hard send-rate cap. null = uncapped. */
  maxRateHz?: number | null;
  /** transmission mode — see `FrameMode`. */
  frameMode?: FrameMode;
  [key: string]: unknown;
}

/**
 * Transmission mode (per output):
 *   standard — send only when a channel changes, plus a keep-alive refresh.
 *              Full 512-channel frame. Lowest traffic (the default).
 *   full     — send all 512 channels every cycle (continuous), capped at maxRateHz.
 *   partial  — send continuously, but only up to the highest used channel
 *              (smaller packets). The receiver must support a short frame.
 */
export type FrameMode = 'standard' | 'full' | 'partial';

/**
 * Output — abstract base for DMX outputs.
 *
 * Subclasses MUST implement:
 *   async _open()                — start transport (open socket, USB, etc.)
 *   async _close()               — tear down transport
 *   _send(universe, snapshot)    — write one universe frame on the wire
 *
 * Subclasses MAY override:
 *   shouldSend(universe, now)    — gate per-tick. Default: rate cap → dirty
 *                                  OR keep-alive expired.
 *
 * Subscriptions: outputs are dispatched a universe only if its `id` is in
 * `subscribedUniverses` (Set). Empty set = subscribe to all (default off).
 *
 * Traffic shaping (per output, per universe):
 *   keepAliveMs   periodic re-send even when no change. Default 1000.
 *                 0 disables keep-alive. Art-Net spec allows up to 4000.
 *   maxRateHz     hard cap — never send faster than this, even if data
 *                 changes every engine tick. Default null = no cap.
 *                 Useful for slow/cheap nodes (e.g. set to 30 for ESP32).
 *
 * Send-rate tracking is per-output, per-universe (`_lastSentAt` Map).
 * Multiple outputs subscribed to the same universe operate independently.
 *
 * Config shape is free-form per subclass; common keys:
 *   id, name, enabled, subscribedUniverses, keepAliveMs, maxRateHz
 */
export class Output extends EventEmitter {
  static TYPE = 'abstract';

  id: string;
  name: string;
  enabled: boolean;
  subscribedUniverses: Set<number>;
  /** ms — heartbeat interval to re-send even if not dirty. 0 disables. */
  keepAliveMs: number;
  /** Hz — hard send-rate cap. null = uncapped (engine refreshHz limits). */
  maxRateHz: number | null;
  /** transmission mode — standard (on-change + keep-alive) / full / partial. */
  frameMode: FrameMode;
  _minSendIntervalMs: number;
  /** Per-universe last send timestamp (ms) — per output, independent. */
  _lastSentAt: Map<number, number>;
  /** Per-universe high-water channel count for `partial` (never shrinks → no stale channels). */
  _partialHigh: Map<number, number>;
  _open: boolean;

  constructor(config: OutputConfig = {}) {
    super();
    this.id = config.id ?? cryptoRandomId();
    this.name = config.name ?? 'Output';
    this.enabled = config.enabled ?? true;
    this.subscribedUniverses = new Set(config.subscribedUniverses ?? []);
    /** ms — heartbeat interval to re-send even if not dirty. 0 disables. */
    this.keepAliveMs = config.keepAliveMs ?? 1000;
    /** Hz — hard send-rate cap. null = uncapped (engine refreshHz limits). */
    this.maxRateHz = config.maxRateHz ?? null;
    this.frameMode = config.frameMode ?? 'standard';
    this._minSendIntervalMs = this.maxRateHz ? (1000 / this.maxRateHz) : 0;
    /** Per-universe last send timestamp (ms) — per output, independent. */
    this._lastSentAt = new Map();
    this._partialHigh = new Map();
    this._open = false;
  }

  /** Update rate cap at runtime. */
  setMaxRate(hz: number | null): void {
    this.maxRateHz = hz;
    this._minSendIntervalMs = hz ? (1000 / hz) : 0;
  }

  /** Update transmission mode at runtime. */
  setFrameMode(mode: FrameMode): void {
    this.frameMode = mode;
    if (mode !== 'partial') this._partialHigh.clear();
  }

  get type(): string {
    return (this.constructor as typeof Output).TYPE;
  }

  get isOpen(): boolean {
    return this._open;
  }

  subscribe(universeId: number): void { this.subscribedUniverses.add(universeId); }
  unsubscribe(universeId: number): void { this.subscribedUniverses.delete(universeId); }
  subscribesTo(universeId: number): boolean {
    return this.subscribedUniverses.size === 0 || this.subscribedUniverses.has(universeId);
  }

  async open(): Promise<void> {
    if (this._open) return;
    await this._openImpl();
    this._open = true;
    this.emit('opened');
  }

  async close(): Promise<void> {
    if (!this._open) return;
    await this._closeImpl();
    this._open = false;
    this.emit('closed');
  }

  shouldSend(universe: Universe, now: number): boolean {
    if (!this.enabled || !this._open) return false;
    if (!this.subscribesTo(universe.id)) return false;
    const last = this._lastSentAt.get(universe.id) ?? 0;
    // Hard rate cap — never faster than maxRateHz.
    if (this._minSendIntervalMs > 0 && (now - last) < this._minSendIntervalMs) return false;
    // full / partial transmit continuously (every rate-allowed tick).
    if (this.frameMode !== 'standard') return true;
    // standard: only on change, with a keep-alive heartbeat.
    if (universe.dirty) return true;
    if (this.keepAliveMs > 0 && (now - last) >= this.keepAliveMs) return true;
    return false;
  }

  /** Frame to put on the wire — full 512, or (partial) up to the highest used
   *  channel, tracked as a per-universe high-water mark so it never shrinks.
   *  Always confined to the real DMX range; the virtual channel region above
   *  {@link DMX_CHANNELS} never reaches the wire. */
  _frameData(universe: Universe): Uint8Array {
    const wire = universe.data.subarray(0, DMX_CHANNELS);
    if (this.frameMode !== 'partial') return wire;
    let hi = 1;
    for (let i = wire.length - 1; i >= 0; i--) { if (wire[i] !== 0) { hi = i + 1; break; } }
    const hw = Math.max(hi, this._partialHigh.get(universe.id) ?? 0);
    this._partialHigh.set(universe.id, hw);
    return wire.subarray(0, hw);
  }

  send(universe: Universe, now: number): void {
    if (!this.shouldSend(universe, now)) return;
    try {
      this._sendImpl(universe, this._frameData(universe));
      this._lastSentAt.set(universe.id, now);
      universe.lastSentAt = now; // aggregate (kept for compat)
    } catch (err) {
      this.emit('error', err);
    }
  }

  /** Force a full 512-channel zero frame for one universe straight onto the
   *  wire, bypassing every gate (subscription, dirty check, rate cap). Used on
   *  shutdown so fixtures go dark instead of latching their last received frame
   *  when the socket closes. No-op if the transport isn't open. */
  blackout(universe: Universe): void {
    if (!this._open) return;
    try {
      this._sendImpl(universe, new Uint8Array(DMX_CHANNELS));
    } catch (err) {
      this.emit('error', err);
    }
  }

  // ---- subclass hooks -------------------------------------------------
  async _openImpl(): Promise<void> { throw new Error('Output._openImpl not implemented'); }
  async _closeImpl(): Promise<void> { throw new Error('Output._closeImpl not implemented'); }
  _sendImpl(_universe: Universe, _data: Uint8Array): void { throw new Error('Output._sendImpl not implemented'); }
}

function cryptoRandomId(): string {
  return 'out_' + Math.random().toString(36).slice(2, 10);
}
