export const DMX_CHANNELS = 512;

/**
 * Virtual channel region — addresses ABOVE the 512 wire channels, used for
 * synthetic per-fixture controls (e.g. virtual dimmers on RGB-only fixtures)
 * that must ride the full mix/scene/fade pipeline but never go on the wire.
 * The Art-Net/sACN encoders cap every frame at {@link DMX_CHANNELS}, so the
 * virtual region [DMX_CHANNELS+1 .. TOTAL_CHANNELS] is automatically excluded
 * from transmission.
 */
export const VIRTUAL_CHANNELS = 512;
/** Total addressable channels per universe — real DMX + virtual region. */
export const TOTAL_CHANNELS = DMX_CHANNELS + VIRTUAL_CHANNELS;

/**
 * Universe — DMX state: 512 wire channels plus a virtual region (see
 * {@link VIRTUAL_CHANNELS}) for synthetic controls. Buffers are
 * {@link TOTAL_CHANNELS} long; only the first {@link DMX_CHANNELS} reach the wire.
 *
 * Buffers:
 *   programmer  user/base writes land here (setChannel, IPC, scenes' base)
 *   data        final mixed output. Engine's MixPipeline writes this each tick.
 *               Outputs read `data` for transmission (first 512 only).
 *   _prev       last-sent snapshot for change detection (dirty flag).
 *   engaged     per-channel mask of MANUALLY engaged programmer channels (a
 *               moved fader). Scene capture reads this — not raw non-zero values
 *               — so the fixture defaults that `Fixture.apply` flushes into the
 *               programmer at patch time are NOT captured. Only `engage`/`release`
 *               touch it; raw `setChannel`/`setRange`/`apply` leave it untouched.
 *
 * Dirty flag is set by the engine *after* mix when `data` differs from `_prev`.
 * Outputs keep their dirty-vs-keepalive gating unchanged.
 */
export class Universe {
  id: number;
  name: string;
  programmer: Uint8Array;
  data: Uint8Array;
  _prev: Uint8Array;
  engaged: Uint8Array;
  dirty: boolean;
  lastSentAt: number;

  constructor(id: number, name: string = `Universe ${id + 1}`) {
    this.id = id;
    this.name = name;
    this.programmer = new Uint8Array(TOTAL_CHANNELS);
    this.data       = new Uint8Array(TOTAL_CHANNELS);
    this._prev      = new Uint8Array(TOTAL_CHANNELS);
    this.engaged    = new Uint8Array(TOTAL_CHANNELS);
    this.dirty = true;
    this.lastSentAt = 0;
  }

  /** Write to programmer (base) layer. Does NOT mark the channel engaged.
   *  Accepts virtual addresses up to {@link TOTAL_CHANNELS}. */
  setChannel(channel: number, value: number): void {
    if (channel < 1 || channel > TOTAL_CHANNELS) return;
    this.programmer[channel - 1] = value & 0xff;
  }

  /** Manually engage a channel (LIVE fader write): set its value + flag it as
   *  engaged so scene capture / the programmer count include exactly it. */
  engage(channel: number, value: number): void {
    if (channel < 1 || channel > TOTAL_CHANNELS) return;
    this.programmer[channel - 1] = value & 0xff;
    this.engaged[channel - 1] = 1;
  }

  /** Release a manually-engaged channel: zero it and clear its engaged flag. */
  release(channel: number): void {
    if (channel < 1 || channel > TOTAL_CHANNELS) return;
    this.programmer[channel - 1] = 0;
    this.engaged[channel - 1] = 0;
  }

  /** Read mixed output (post-pipeline). */
  getChannel(channel: number): number {
    if (channel < 1 || channel > TOTAL_CHANNELS) return 0;
    return this.data[channel - 1];
  }

  /** Read raw programmer value (pre-mix). */
  getProgrammerChannel(channel: number): number {
    if (channel < 1 || channel > TOTAL_CHANNELS) return 0;
    return this.programmer[channel - 1];
  }

  setRange(startChannel: number, values: ArrayLike<number>): void {
    const start = startChannel - 1;
    for (let i = 0; i < values.length && start + i < TOTAL_CHANNELS; i++) {
      this.programmer[start + i] = values[i] & 0xff;
    }
  }

  fillProgrammer(value: number = 0): void {
    this.programmer.fill(value & 0xff);
    this.engaged.fill(0);
  }

  snapshot(): Uint8Array {
    return Uint8Array.from(this.data);
  }
}
