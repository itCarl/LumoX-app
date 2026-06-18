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
  name: string;
  _open: boolean;

  constructor(name: string) {
    super();
    this.name = name;
    this._open = false;
  }
  get isOpen(): boolean { return this._open; }

  async open(): Promise<void>  { if (this._open) return; await this._openImpl();  this._open = true;  this.emit('opened'); }
  async close(): Promise<void> { if (!this._open) return; await this._closeImpl(); this._open = false; this.emit('closed'); }

  noteOn(note: number, velocity = 127, channel = 0): void {
    if (!this._open) return;
    this._sendNoteOn(note & 0x7f, velocity & 0x7f, channel & 0x0f);
  }
  noteOff(note: number, channel = 0): void {
    if (!this._open) return;
    this._sendNoteOff(note & 0x7f, channel & 0x0f);
  }
  cc(controller: number, value: number, channel = 0): void {
    if (!this._open) return;
    this._sendCC(controller & 0x7f, value & 0x7f, channel & 0x0f);
  }

  async _openImpl(): Promise<void>  { throw new Error('MidiOutput._openImpl not implemented'); }
  async _closeImpl(): Promise<void> { throw new Error('MidiOutput._closeImpl not implemented'); }
  _sendNoteOn(_note: number, _velocity: number, _channel: number): void  { throw new Error('MidiOutput._sendNoteOn not implemented'); }
  _sendNoteOff(_note: number, _channel: number): void { throw new Error('MidiOutput._sendNoteOff not implemented'); }
  _sendCC(_controller: number, _value: number, _channel: number): void      { throw new Error('MidiOutput._sendCC not implemented'); }
}
