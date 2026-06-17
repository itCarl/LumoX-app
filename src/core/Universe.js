export const DMX_CHANNELS = 512;

/**
 * Universe — 512-channel DMX state.
 *
 * Buffers:
 *   programmer  user/base writes land here (setChannel, IPC, scenes' base)
 *   data        final mixed output. Engine's MixPipeline writes this each tick.
 *               Outputs read `data` for transmission.
 *   _prev       last-sent snapshot for change detection (dirty flag).
 *
 * Dirty flag is set by the engine *after* mix when `data` differs from `_prev`.
 * Outputs keep their dirty-vs-keepalive gating unchanged.
 */
export class Universe {
  constructor(id, name = `Universe ${id + 1}`) {
    this.id = id;
    this.name = name;
    this.programmer = new Uint8Array(DMX_CHANNELS);
    this.data       = new Uint8Array(DMX_CHANNELS);
    this._prev      = new Uint8Array(DMX_CHANNELS);
    this.dirty = true;
    this.lastSentAt = 0;
  }

  /** Write to programmer (base) layer. */
  setChannel(channel, value) {
    if (channel < 1 || channel > DMX_CHANNELS) return;
    this.programmer[channel - 1] = value & 0xff;
  }

  /** Read mixed output (post-pipeline). */
  getChannel(channel) {
    if (channel < 1 || channel > DMX_CHANNELS) return 0;
    return this.data[channel - 1];
  }

  /** Read raw programmer value (pre-mix). */
  getProgrammerChannel(channel) {
    if (channel < 1 || channel > DMX_CHANNELS) return 0;
    return this.programmer[channel - 1];
  }

  setRange(startChannel, values) {
    const start = startChannel - 1;
    for (let i = 0; i < values.length && start + i < DMX_CHANNELS; i++) {
      this.programmer[start + i] = values[i] & 0xff;
    }
  }

  fillProgrammer(value = 0) {
    this.programmer.fill(value & 0xff);
  }

  snapshot() {
    return Uint8Array.from(this.data);
  }
}
