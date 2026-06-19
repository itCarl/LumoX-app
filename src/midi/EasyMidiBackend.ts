import { MidiInput } from './MidiInput';
import { MidiOutput } from './MidiOutput';

/**
 * EasyMidiBackend — wraps the `easymidi` npm package.
 *
 * `easymidi` is an optional dependency. Importing this module without it
 * installed throws on `load()`. Use `EasyMidiBackend.tryLoad()` for
 * graceful fallback.
 *
 *   const backend = await EasyMidiBackend.tryLoad();
 *   if (!backend) // show install hint
 */
export class EasyMidiBackend {
  easymidi: any;

  constructor(easymidi: any) {
    this.easymidi = easymidi;
  }

  /** @returns {Promise<EasyMidiBackend|null>} */
  static async tryLoad(): Promise<EasyMidiBackend | null> {
    try {
      const mod: any = await import('easymidi');
      return new EasyMidiBackend(mod.default ?? mod);
    } catch {
      return null;
    }
  }

  listInputs(): string[]  { return this.easymidi.getInputs();  }
  listOutputs(): string[] { return this.easymidi.getOutputs(); }

  openInput(name: string): EasyMidiInput  { return new EasyMidiInput(this.easymidi, name); }
  openOutput(name: string): EasyMidiOutput { return new EasyMidiOutput(this.easymidi, name); }
}

class EasyMidiInput extends MidiInput {
  _mod: any;
  _port: any;

  constructor(easymidi: any, name: string) {
    super(name);
    this._mod = easymidi;
    this._port = null;
  }
  async _openImpl(): Promise<void> {
    this._port = new this._mod.Input(this.name);
    // node-midi ignores timing (clock) messages by default; opt back in so the
    // 'clock' events below actually fire (needed for MIDI-clock tempo sync).
    // ignoreTypes(sysex, timing, activeSensing) — keep sysex/sensing ignored.
    try {
      const raw = (this._port as any)._input ?? (this._port as any).input;
      raw?.ignoreTypes?.(true, false, true);
    } catch { /* backend without a raw port — clock simply won't arrive */ }
    this._port.on('noteon',     (m: any) => this.emit('noteon',     m));
    this._port.on('noteoff',    (m: any) => this.emit('noteoff',    m));
    this._port.on('cc',         (m: any) => this.emit('cc',         m));
    this._port.on('aftertouch', (m: any) => this.emit('aftertouch', m));
    this._port.on('pitch',      (m: any) => this.emit('pitchbend',  m));
    // System-realtime clock (for MIDI-clock tempo sync). easymidi delivers these
    // only when the Input is opened with SysEx/clock enabled — pass that flag.
    this._port.on('clock',      ()       => this.emit('clock'));
    this._port.on('start',      ()       => this.emit('start'));
    this._port.on('continue',   ()       => this.emit('continue'));
    this._port.on('stop',       ()       => this.emit('stop'));
  }
  async _closeImpl(): Promise<void> {
    try { this._port?.close(); } catch {}
    this._port = null;
  }
}

class EasyMidiOutput extends MidiOutput {
  _mod: any;
  _port: any;

  constructor(easymidi: any, name: string) {
    super(name);
    this._mod = easymidi;
    this._port = null;
  }
  async _openImpl(): Promise<void>  { this._port = new this._mod.Output(this.name); }
  async _closeImpl(): Promise<void> { try { this._port?.close(); } catch {} this._port = null; }
  _sendNoteOn(note: number, velocity: number, channel: number): void  { this._port.send('noteon',  { note, velocity, channel }); }
  _sendNoteOff(note: number, channel: number): void           { this._port.send('noteoff', { note, velocity: 0, channel }); }
  _sendCC(controller: number, value: number, channel: number): void   { this._port.send('cc',      { controller, value, channel }); }
}
