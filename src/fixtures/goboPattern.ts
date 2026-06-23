/**
 * Gobo pattern — a hand-drawn monochrome icon for a gobo capability.
 *
 * A pattern is a `GOBO_GRID × GOBO_GRID` on/off bitmask (one bit per cell, white
 * cell = on). It is stored on a `GoboCapability` as a compact string so a gobo's
 * shape survives save/load and can be drawn next to its value range (fixture
 * editor) and on the live GOBO fader strip.
 *
 * Wire format: `"g32:" + base64(bytes)` where `bytes` packs the grid row-major,
 * MSB-first (cell 0 = bit 7 of byte 0). 32×32 = 1024 cells = 128 bytes ≈ 172
 * base64 chars. Pure + dependency-free (type-only), so it bundles into the renderer.
 */

export const GOBO_GRID = 32;
const CELLS = GOBO_GRID * GOBO_GRID;
const BYTES = CELLS / 8;
const PREFIX = 'g32:';

// base64 without Node's Buffer / browser atob (works in engine + renderer).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1] ?? 0, b2 = bytes[i + 2] ?? 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

function b64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let acc = 0, bits = 0, p = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out[p++] = (acc >> bits) & 0xff; }
  }
  return out;
}

/** Pack a grid of on/off cells (row-major, length `CELLS`) to a wire string. */
export function encodeGobo(bits: boolean[]): string {
  const bytes = new Uint8Array(BYTES);
  for (let i = 0; i < CELLS; i++) {
    if (bits[i]) bytes[i >> 3] |= 0x80 >> (i & 7);
  }
  return PREFIX + bytesToB64(bytes);
}

/** Unpack a wire string back to `CELLS` on/off cells. Invalid input → all-off. */
export function decodeGobo(str: string | null | undefined): boolean[] {
  const bits = new Array<boolean>(CELLS).fill(false);
  if (!str || !str.startsWith(PREFIX)) return bits;
  const bytes = b64ToBytes(str.slice(PREFIX.length));
  for (let i = 0; i < CELLS; i++) {
    bits[i] = !!(bytes[i >> 3] & (0x80 >> (i & 7)));
  }
  return bits;
}

/** True for a well-formed gobo pattern string (the prefix + non-empty payload). */
export function isGoboPattern(str: unknown): str is string {
  return typeof str === 'string' && str.startsWith(PREFIX) && str.length > PREFIX.length;
}
