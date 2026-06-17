import { EventEmitter } from 'node:events';

/**
 * MidiOutput — abstract base for sending MIDI (mostly for LED feedback).
 *
 * Subclasses MUST implement:
 *   async _openImpl()
 *   async _closeImpl()
 *   _sendNoteOn(note, velocity, channel)
 *   _sendNoteOff(note, channel)
 *   _sendCC(controller, value, channel)
 */
export class MidiOutput extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this._open = false;
  }
  get isOpen() { return this._open; }

  async open()  { if (this._open) return; await this._openImpl();  this._open = true;  this.emit('opened'); }
  async close() { if (!this._open) return; await this._closeImpl(); this._open = false; this.emit('closed'); }

  noteOn(note, velocity = 127, channel = 0) {
    if (!this._open) return;
    this._sendNoteOn(note & 0x7f, velocity & 0x7f, channel & 0x0f);
  }
  noteOff(note, channel = 0) {
    if (!this._open) return;
    this._sendNoteOff(note & 0x7f, channel & 0x0f);
  }
  cc(controller, value, channel = 0) {
    if (!this._open) return;
    this._sendCC(controller & 0x7f, value & 0x7f, channel & 0x0f);
  }

  async _openImpl()  { throw new Error('MidiOutput._openImpl not implemented'); }
  async _closeImpl() { throw new Error('MidiOutput._closeImpl not implemented'); }
  _sendNoteOn()  { throw new Error('MidiOutput._sendNoteOn not implemented'); }
  _sendNoteOff() { throw new Error('MidiOutput._sendNoteOff not implemented'); }
  _sendCC()      { throw new Error('MidiOutput._sendCC not implemented'); }
}
