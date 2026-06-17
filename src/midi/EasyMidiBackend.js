import { MidiInput } from './MidiInput.js';
import { MidiOutput } from './MidiOutput.js';

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
  constructor(easymidi) {
    this.easymidi = easymidi;
  }

  /** @returns {Promise<EasyMidiBackend|null>} */
  static async tryLoad() {
    try {
      const mod = await import('easymidi');
      return new EasyMidiBackend(mod.default ?? mod);
    } catch {
      return null;
    }
  }

  listInputs()  { return this.easymidi.getInputs();  }
  listOutputs() { return this.easymidi.getOutputs(); }

  openInput(name)  { return new EasyMidiInput(this.easymidi, name); }
  openOutput(name) { return new EasyMidiOutput(this.easymidi, name); }
}

class EasyMidiInput extends MidiInput {
  constructor(easymidi, name) {
    super(name);
    this._mod = easymidi;
    this._port = null;
  }
  async _openImpl() {
    this._port = new this._mod.Input(this.name);
    this._port.on('noteon',     (m) => this.emit('noteon',     m));
    this._port.on('noteoff',    (m) => this.emit('noteoff',    m));
    this._port.on('cc',         (m) => this.emit('cc',         m));
    this._port.on('aftertouch', (m) => this.emit('aftertouch', m));
    this._port.on('pitch',      (m) => this.emit('pitchbend',  m));
  }
  async _closeImpl() {
    try { this._port?.close(); } catch {}
    this._port = null;
  }
}

class EasyMidiOutput extends MidiOutput {
  constructor(easymidi, name) {
    super(name);
    this._mod = easymidi;
    this._port = null;
  }
  async _openImpl()  { this._port = new this._mod.Output(this.name); }
  async _closeImpl() { try { this._port?.close(); } catch {} this._port = null; }
  _sendNoteOn(note, velocity, channel)  { this._port.send('noteon',  { note, velocity, channel }); }
  _sendNoteOff(note, channel)           { this._port.send('noteoff', { note, velocity: 0, channel }); }
  _sendCC(controller, value, channel)   { this._port.send('cc',      { controller, value, channel }); }
}
