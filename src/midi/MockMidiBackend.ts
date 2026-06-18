import { MidiInput } from './MidiInput';
import { MidiOutput } from './MidiOutput';

/** A MIDI message recorded by a MockMidiOutput. */
export interface MockSentMessage {
  type: 'noteon' | 'noteoff' | 'cc';
  note?: number;
  velocity?: number;
  controller?: number;
  value?: number;
  channel: number;
}

/**
 * MockMidiBackend — in-process MIDI for unit tests + headless examples.
 * Inputs are simple emitters with `inject(...)` helpers. Outputs record
 * everything they receive in `.sent[]`.
 */
export class MockMidiBackend {
  inputs: Map<string, MockMidiInput>;
  outputs: Map<string, MockMidiOutput>;

  constructor() {
    this.inputs = new Map();
    this.outputs = new Map();
  }
  listInputs(): string[]  { return [...this.inputs.keys()]; }
  listOutputs(): string[] { return [...this.outputs.keys()]; }
  openInput(name: string): MockMidiInput {
    let i = this.inputs.get(name);
    if (!i) { i = new MockMidiInput(name); this.inputs.set(name, i); }
    return i;
  }
  openOutput(name: string): MockMidiOutput {
    let o = this.outputs.get(name);
    if (!o) { o = new MockMidiOutput(name); this.outputs.set(name, o); }
    return o;
  }
}

export class MockMidiInput extends MidiInput {
  async _openImpl(): Promise<void>  { /* no-op */ }
  async _closeImpl(): Promise<void> { /* no-op */ }
  inject(type: string, payload: unknown): void { this.emit(type, payload); }
}

export class MockMidiOutput extends MidiOutput {
  sent: MockSentMessage[];

  constructor(name: string) { super(name); this.sent = []; }
  async _openImpl(): Promise<void>  { /* no-op */ }
  async _closeImpl(): Promise<void> { /* no-op */ }
  _sendNoteOn(note: number, velocity: number, channel: number): void { this.sent.push({ type: 'noteon',  note, velocity, channel }); }
  _sendNoteOff(note: number, channel: number): void          { this.sent.push({ type: 'noteoff', note, channel }); }
  _sendCC(controller: number, value: number, channel: number): void  { this.sent.push({ type: 'cc',      controller, value, channel }); }
}
