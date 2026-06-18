import { EventEmitter } from 'node:events';

/** A note message emitted by an input ('noteon' / 'noteoff'). */
export interface MidiNoteMessage {
  note: number;
  velocity: number;
  channel: number;
}

/** A control-change message emitted by an input ('cc'). */
export interface MidiCCMessage {
  controller: number;
  value: number;
  channel: number;
}

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

  async _openImpl(): Promise<void>  { throw new Error('MidiInput._openImpl not implemented'); }
  async _closeImpl(): Promise<void> { throw new Error('MidiInput._closeImpl not implemented'); }
}
