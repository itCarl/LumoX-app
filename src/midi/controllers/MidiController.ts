import { EventEmitter } from 'node:events';
import type { MidiInput } from '../MidiInput';
import type { MidiOutput } from '../MidiOutput';
import type { Patch } from '../../show/Patch';
import type { GroupManager } from '../../show/GroupManager';

/** A registered input handler we remove on disconnect. */
interface RegisteredHandler {
  event: string;
  fn: (...args: any[]) => void;
}

export interface MidiControllerOptions {
  engine: any;
  patch?: Patch | null;
  groups?: GroupManager | null;
  id?: string;
  name?: string;
}

/**
 * MidiController — base class for hardware-specific controllers.
 *
 * Subclasses (e.g. `ApcMiniMk2`) wire up:
 *   - MIDI message → engine action handlers
 *   - LED feedback on state changes
 *
 * Lifecycle:
 *   const ctl = new ApcMiniMk2({ engine, patch, groups });
 *   await ctl.connect(input, output);   // both MidiInput + MidiOutput
 *   ...
 *   await ctl.disconnect();
 *
 * Subclasses should override `_bindHandlers()` (attach listeners on
 * `this.input`) and `_initLeds()` (push initial LED state to `this.output`).
 */
export class MidiController extends EventEmitter {
  static NAME = 'generic';

  engine: any;
  patch: Patch | null;
  groups: GroupManager | null;
  id: string;
  name: string;
  input: MidiInput | null;
  output: MidiOutput | null;
  _handlers: RegisteredHandler[];

  constructor({ engine, patch, groups, id, name }: MidiControllerOptions = {} as MidiControllerOptions) {
    super();
    if (!engine) throw new Error('MidiController needs engine');
    this.engine = engine;
    this.patch = patch ?? null;
    this.groups = groups ?? null;
    this.id = id ?? `midi_${Math.random().toString(36).slice(2, 8)}`;
    this.name = name ?? (this.constructor as typeof MidiController).NAME;
    this.input = null;
    this.output = null;
    this._handlers = [];      // [{event, fn}] registered on this.input
  }

  /** Attach this controller to MIDI ports (both already opened or to-open). */
  async connect(input: MidiInput | null, output: MidiOutput | null = null): Promise<void> {
    this.input = input;
    this.output = output;
    if (input && !input.isOpen)  await input.open();
    if (output && !output.isOpen) await output.open();
    this._bindHandlers();
    this._initLeds();
    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    this._unbindHandlers();
    this._allLedsOff();
    try { await this.input?.close();  } catch {}
    try { await this.output?.close(); } catch {}
    this.input = null;
    this.output = null;
    this.emit('disconnected');
  }

  /** Register a handler we'll remove on disconnect. */
  _on(event: string, fn: (...args: any[]) => void): void {
    if (!this.input) return;
    this.input.on(event, fn);
    this._handlers.push({ event, fn });
  }

  _unbindHandlers(): void {
    for (const { event, fn } of this._handlers) this.input?.off(event, fn);
    this._handlers = [];
  }

  // ---- subclass hooks -------------------------------------------------
  _bindHandlers(): void { /* override */ }
  _initLeds(): void     { /* override */ }
  _allLedsOff(): void   { /* override */ }
}
