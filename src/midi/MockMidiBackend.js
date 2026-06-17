import { MidiInput } from './MidiInput.js';
import { MidiOutput } from './MidiOutput.js';

/**
 * MockMidiBackend — in-process MIDI for unit tests + headless examples.
 * Inputs are simple emitters with `inject(...)` helpers. Outputs record
 * everything they receive in `.sent[]`.
 */
export class MockMidiBackend {
  constructor() {
    this.inputs = new Map();
    this.outputs = new Map();
  }
  listInputs()  { return [...this.inputs.keys()]; }
  listOutputs() { return [...this.outputs.keys()]; }
  openInput(name) {
    let i = this.inputs.get(name);
    if (!i) { i = new MockMidiInput(name); this.inputs.set(name, i); }
    return i;
  }
  openOutput(name) {
    let o = this.outputs.get(name);
    if (!o) { o = new MockMidiOutput(name); this.outputs.set(name, o); }
    return o;
  }
}

export class MockMidiInput extends MidiInput {
  async _openImpl()  { /* no-op */ }
  async _closeImpl() { /* no-op */ }
  inject(type, payload) { this.emit(type, payload); }
}

export class MockMidiOutput extends MidiOutput {
  constructor(name) { super(name); this.sent = []; }
  async _openImpl()  { /* no-op */ }
  async _closeImpl() { /* no-op */ }
  _sendNoteOn(note, velocity, channel) { this.sent.push({ type: 'noteon',  note, velocity, channel }); }
  _sendNoteOff(note, channel)          { this.sent.push({ type: 'noteoff', note, channel }); }
  _sendCC(controller, value, channel)  { this.sent.push({ type: 'cc',      controller, value, channel }); }
}
