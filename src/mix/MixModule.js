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
  constructor(config = {}) {
    this.id = config.id ?? `mod_${Math.random().toString(36).slice(2, 8)}`;
    this.name = config.name ?? this.constructor.name;
    this.enabled = config.enabled ?? true;
  }

  /** Subclasses override. Default = no-op. */
  process(_universe, _ctx) { /* override */ }
}

// ---- blend helpers (channel-level, 8-bit) -------------------------------

/** HTP: dst[i] = max(dst[i], src[i] * opacity). opacity 0..1 */
export function blendHTP(dst, src, opacity = 1) {
  const op = clamp01(opacity);
  for (let i = 0; i < dst.length && i < src.length; i++) {
    const s = (src[i] * op) | 0;
    if (s > dst[i]) dst[i] = s;
  }
}

/** LTP: dst[i] = src[i] * opacity + dst[i] * (1 - opacity). opacity 0..1 */
export function blendLTP(dst, src, opacity = 1) {
  const op = clamp01(opacity);
  if (op >= 1) { dst.set(src.subarray(0, dst.length)); return; }
  if (op <= 0) return;
  const inv = 1 - op;
  for (let i = 0; i < dst.length && i < src.length; i++) {
    dst[i] = (src[i] * op + dst[i] * inv) | 0;
  }
}

/** Scale every channel by factor (0..1). */
export function scaleAll(dst, factor) {
  if (factor >= 1) return;
  if (factor <= 0) { dst.fill(0); return; }
  for (let i = 0; i < dst.length; i++) dst[i] = (dst[i] * factor) | 0;
}

/** Scale only channels listed in `mask` Set<number> (1-based DMX addrs). */
export function scaleMasked(dst, factor, mask) {
  if (factor >= 1) return;
  for (const ch of mask) {
    const i = ch - 1;
    if (i >= 0 && i < dst.length) dst[i] = (dst[i] * factor) | 0;
  }
}

export function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

export function buffersEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
