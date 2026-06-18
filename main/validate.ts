// Lightweight runtime guards for IPC payloads. The renderer is sandboxed and
// context-isolated, but a buggy or compromised renderer must still not be able
// to feed the engine NaN universe ids, out-of-range channels, or a malformed
// host string. Throwing here rejects the `invoke()` promise on the renderer
// side; coercing helpers (vLevel) clamp instead, so high-frequency fader writes
// never spam errors.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Require a finite integer, optionally within [min, max]. Throws otherwise. */
export function vInt(value: unknown, name: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`${name} must be an integer`);
  }
  if (value < min || value > max) {
    throw new ValidationError(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

/** Require a finite number, optionally within [min, max]. Throws otherwise. */
export function vNum(value: unknown, name: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${name} must be a number`);
  }
  if (value < min || value > max) {
    throw new ValidationError(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

/** DMX channel index, 1..512. */
export const vChannel = (value: unknown, name = 'channel'): number => vInt(value, name, 1, 512);

/**
 * DMX level, clamped to 0..255. Coerces rather than throws: fader/slider input
 * fires continuously and a stray NaN must not abort the stream — just floor it.
 */
export function vLevel(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Logical universe id — non-negative integer (Art-Net port-address range). */
export const vUniverseId = (value: unknown, name = 'universeId'): number =>
  vInt(value, name, 0, 32767);

/** Non-empty trimmed string with a length cap. Throws otherwise. */
export function vString(value: unknown, name: string, maxLen = 200): string {
  if (typeof value !== 'string') throw new ValidationError(`${name} must be a string`);
  const s = value.trim();
  if (!s) throw new ValidationError(`${name} must not be empty`);
  if (s.length > maxLen) throw new ValidationError(`${name} must be ${maxLen} characters or fewer`);
  return s;
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
// RFC 1123 hostname: labels of [a-z0-9-], not starting/ending with a hyphen.
const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** A network host — IPv4 dotted-quad (incl. broadcast) or a DNS hostname. */
export function vHost(value: unknown, name = 'host'): string {
  if (typeof value !== 'string') throw new ValidationError(`${name} must be a string`);
  const h = value.trim();
  const m = IPV4_RE.exec(h);
  if (m) {
    if (m.slice(1).every((o) => Number(o) <= 255)) return h;
    throw new ValidationError(`${name} is not a valid IPv4 address`);
  }
  if (HOSTNAME_RE.test(h)) return h;
  throw new ValidationError(`${name} is not a valid host`);
}
