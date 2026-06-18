import { EventEmitter } from 'node:events';
import { EasyMidiBackend } from './EasyMidiBackend';
import { MockMidiBackend } from './MockMidiBackend';
import { createLogger } from '../util/logger';
import type { MidiInput } from './MidiInput';
import type { MidiOutput } from './MidiOutput';

const log = createLogger('MidiManager');

/** Common surface shared by EasyMidiBackend / MockMidiBackend. */
export interface MidiBackend {
  listInputs(): string[];
  listOutputs(): string[];
  openInput(name: string): MidiInput;
  openOutput(name: string): MidiOutput;
}

/** A controller attachable to the manager (e.g. MidiController subclasses). */
export interface AttachableController {
  id: string;
  disconnect(): Promise<void> | void;
}

export interface MidiManagerOptions {
  backend?: MidiBackend | null;
}

/**
 * MidiManager — owns the active MIDI backend + connected controllers.
 *
 * Backend selection (in order):
 *   1. Backend explicitly passed to constructor.
 *   2. `easymidi` if installed.
 *   3. MockMidiBackend (in-process, no hardware).
 *
 * Controllers are bound at runtime via `attach(controller)` — each
 * controller takes an input + output name and an engine reference.
 *
 * Events:
 *   'attached' (controller)
 *   'detached' (controller)
 */
export class MidiManager extends EventEmitter {
  backend: MidiBackend | null;
  controllers: Map<string, AttachableController>;

  constructor({ backend = null }: MidiManagerOptions = {}) {
    super();
    this.backend = backend;
    this.controllers = new Map();   // name → controller
  }

  /** Pick backend if none explicit. Call before listing/opening. */
  async ensureBackend(): Promise<MidiBackend> {
    if (this.backend) return this.backend;
    const easy = await EasyMidiBackend.tryLoad();
    if (easy) {
      log.info('using easymidi backend');
      this.backend = easy as unknown as MidiBackend;
    } else {
      log.warn('easymidi not installed — falling back to MockMidiBackend (no hardware)');
      this.backend = new MockMidiBackend();
    }
    return this.backend;
  }

  async listInputs(): Promise<string[]>  { await this.ensureBackend(); return this.backend!.listInputs(); }
  async listOutputs(): Promise<string[]> { await this.ensureBackend(); return this.backend!.listOutputs(); }

  /** Convenience: find a port name containing a substring (case-insensitive). */
  async findPort(list: 'in' | 'out', hint: string): Promise<string | null> {
    const items = list === 'in' ? await this.listInputs() : await this.listOutputs();
    const h = hint.toLowerCase();
    return items.find((n) => n.toLowerCase().includes(h)) ?? null;
  }

  async openInput(name: string): Promise<MidiInput>  { await this.ensureBackend(); return this.backend!.openInput(name); }
  async openOutput(name: string): Promise<MidiOutput> { await this.ensureBackend(); return this.backend!.openOutput(name); }

  attach(controller: AttachableController): AttachableController {
    this.controllers.set(controller.id, controller);
    this.emit('attached', controller);
    return controller;
  }

  async detach(idOrController: string | AttachableController): Promise<void> {
    const id = typeof idOrController === 'string' ? idOrController : idOrController?.id;
    const c = this.controllers.get(id);
    if (!c) return;
    await c.disconnect();
    this.controllers.delete(id);
    this.emit('detached', c);
  }

  list(): AttachableController[] { return [...this.controllers.values()]; }
}
