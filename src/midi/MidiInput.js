import { EventEmitter } from 'node:events';

/**
 * MidiInput — abstract base. Backends emit:
 *   'noteon'  { note, velocity, channel }
 *   'noteoff' { note, velocity, channel }
 *   'cc'      { controller, value, channel }
 *   'aftertouch'   { value, channel }
 *   'pitchbend'    { value, channel }
 *
 * Subclasses MUST implement:
 *   async _openImpl()
 *   async _closeImpl()
 */
export class MidiInput extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this._open = false;
  }
  get isOpen() { return this._open; }

  async open()  { if (this._open) return; await this._openImpl();  this._open = true;  this.emit('opened'); }
  async close() { if (!this._open) return; await this._closeImpl(); this._open = false; this.emit('closed'); }

  async _openImpl()  { throw new Error('MidiInput._openImpl not implemented'); }
  async _closeImpl() { throw new Error('MidiInput._closeImpl not implemented'); }
}
