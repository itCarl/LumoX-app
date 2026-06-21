import type { Universe } from '../core/Universe';

/**
 * Context passed to every module's `process()` each tick.
 */
export interface MixContext {
  now: number;
  deltaMs: number;
  frame: number;
}

/**
 * Common config shape for any MixModule subclass.
 */
export interface MixModuleConfig {
  id?: string;
  name?: string;
  enabled?: boolean;
}

/**
 * MixModule — base class for one stage of the mix pipeline.
 *
 * Lifecycle:
 *   process(universe, ctx)   mutate `universe.data` in place.
 *
 * Context shape:
 *   { now: number, deltaMs: number, frame: number }
 *
 * Modules are stateless toward Universe identity — same instance can run for
 * every universe per tick. Per-universe state lives on the universe (or in
 * the module keyed by universe.id) — never assume single-universe context.
 *
 * Modules should be cheap and side-effect-free except for `universe.data`.
 *
 * Common helpers:
 *   - blendHTP(dst, src, opacity)  highest-takes-precedence with opacity
 *   - blendLTP(dst, src, opacity)  latest-takes-precedence with opacity
 *   - scaleAll(dst, factor)        multiply 0..1
 */
export class MixModule {
  id: string;
  name: string;
  enabled: boolean;

  constructor(config: MixModuleConfig = {}) {
    this.id = config.id ?? `mod_${Math.random().toString(36).slice(2, 8)}`;
    this.name = config.name ?? this.constructor.name;
    this.enabled = config.enabled ?? true;
  }

  /** Subclasses override. Default = no-op. */
  process(_universe: Universe, _ctx: MixContext): void { /* override */ }
}

// ---- blend helpers (channel-level, 8-bit) -------------------------------

/** HTP: dst[i] = max(dst[i], src[i] * opacity). opacity 0..1 */
export function blendHTP(dst: Uint8Array, src: Uint8Array, opacity: number = 1): void {
  const op = clamp01(opacity);
  for (let i = 0; i < dst.length && i < src.length; i++) {
    const s = (src[i] * op) | 0;
    if (s > dst[i]) dst[i] = s;
  }
}

/** LTP: dst[i] = src[i] * opacity + dst[i] * (1 - opacity). opacity 0..1 */
export function blendLTP(dst: Uint8Array, src: Uint8Array, opacity: number = 1): void {
  const op = clamp01(opacity);
  if (op >= 1) { dst.set(src.subarray(0, dst.length)); return; }
  if (op <= 0) return;
  const inv = 1 - op;
  for (let i = 0; i < dst.length && i < src.length; i++) {
    dst[i] = (src[i] * op + dst[i] * inv) | 0;
  }
}

/** Scale every channel by factor (0..1). */
export function scaleAll(dst: Uint8Array, factor: number): void {
  if (factor >= 1) return;
  if (factor <= 0) { dst.fill(0); return; }
  for (let i = 0; i < dst.length; i++) dst[i] = (dst[i] * factor) | 0;
}

/** Scale only channels listed in `mask` Set<number> (1-based DMX addrs). */
export function scaleMasked(dst: Uint8Array, factor: number, mask: Set<number>): void {
  if (factor >= 1) return;
  for (const ch of mask) {
    const i = ch - 1;
    if (i >= 0 && i < dst.length) dst[i] = (dst[i] * factor) | 0;
  }
}

export function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }

/**
 * Byte-equal compare. With no `len` it compares the whole buffers (lengths must
 * match); with `len` it compares only the first `len` bytes — used for dirty
 * detection over just the wire region, ignoring the virtual channels that never
 * reach the wire.
 */
export function buffersEqual(a: Uint8Array, b: Uint8Array, len?: number): boolean {
  if (len == null) {
    if (a.length !== b.length) return false;
    len = a.length;
  }
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) return false;
  return true;
}
