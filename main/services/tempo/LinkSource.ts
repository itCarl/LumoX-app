// Ableton Link tempo source — slaves the master tempo to a Link session on the
// local network (and publishes our manual edits back to it). Link needs a native
// addon (`abletonlink`), an OPTIONAL dependency: absent or unbuildable, the
// source degrades to unavailable instead of crashing — the same graceful-load
// pattern as `easymidi` (see EasyMidiBackend.tryLoad). The addon is kept out of
// the esbuild bundle via the `external` list in build.mjs.

const MIN_BPM = 20;
const MAX_BPM = 300;

/** Lazily import the optional native addon. null when it isn't installed. */
async function loadAddon(): Promise<any | null> {
  try {
    const mod: any = await import('abletonlink');
    return mod?.default ?? mod;
  } catch {
    return null;
  }
}

export class LinkSource {
  private link: any = null;

  constructor(private readonly onBpm: (bpm: number) => void) {}

  /** Is the Link addon present on this machine? (Used to gate the UI option.) */
  static async available(): Promise<boolean> {
    return (await loadAddon()) != null;
  }

  /** Join the Link session and start tracking its tempo. @returns false if the
   *  addon is missing or failed to initialise (the source stays selected but inert). */
  async start(): Promise<boolean> {
    const Link = await loadAddon();
    if (!Link) return false;
    try {
      this.link = new Link();
      this.link.enable?.();
      const emit = (bpm: number): void => {
        const r = Math.round(bpm);
        if (r >= MIN_BPM && r <= MAX_BPM) this.onBpm(r);
      };
      // Two delivery styles across addon versions: a 'tempo' event and/or a
      // polling update callback. Subscribe to whichever exists; both funnel to emit.
      this.link.on?.('tempo', emit);
      this.link.startUpdate?.(50, (_beat: number, _phase: number, bpm: number) => emit(bpm));
      if (typeof this.link.bpm === 'number') emit(this.link.bpm);
      return true;
    } catch {
      this.link = null;
      return false;
    }
  }

  async stop(): Promise<void> {
    try {
      this.link?.stopUpdate?.();
      this.link?.disable?.();
    } catch { /* ignore */ }
    this.link = null;
  }

  /** Publish a locally-set tempo into the Link session (manual edits broadcast). */
  setBpm(bpm: number): void {
    try { if (this.link) this.link.bpm = bpm; } catch { /* session gone */ }
  }
}
