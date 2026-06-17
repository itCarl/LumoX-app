import { EventEmitter } from 'node:events';
import { EasyMidiBackend } from './EasyMidiBackend.js';
import { MockMidiBackend } from './MockMidiBackend.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('MidiManager');

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
  constructor({ backend = null } = {}) {
    super();
    this.backend = backend;
    this.controllers = new Map();   // name → controller
  }

  /** Pick backend if none explicit. Call before listing/opening. */
  async ensureBackend() {
    if (this.backend) return this.backend;
    const easy = await EasyMidiBackend.tryLoad();
    if (easy) {
      log.info('using easymidi backend');
      this.backend = easy;
    } else {
      log.warn('easymidi not installed — falling back to MockMidiBackend (no hardware)');
      this.backend = new MockMidiBackend();
    }
    return this.backend;
  }

  async listInputs()  { await this.ensureBackend(); return this.backend.listInputs(); }
  async listOutputs() { await this.ensureBackend(); return this.backend.listOutputs(); }

  /** Convenience: find a port name containing a substring (case-insensitive). */
  async findPort(list, hint) {
    const items = list === 'in' ? await this.listInputs() : await this.listOutputs();
    const h = hint.toLowerCase();
    return items.find((n) => n.toLowerCase().includes(h)) ?? null;
  }

  async openInput(name)  { await this.ensureBackend(); return this.backend.openInput(name); }
  async openOutput(name) { await this.ensureBackend(); return this.backend.openOutput(name); }

  attach(controller) {
    this.controllers.set(controller.id, controller);
    this.emit('attached', controller);
    return controller;
  }

  async detach(idOrController) {
    const id = typeof idOrController === 'string' ? idOrController : idOrController?.id;
    const c = this.controllers.get(id);
    if (!c) return;
    await c.disconnect();
    this.controllers.delete(id);
    this.emit('detached', c);
  }

  list() { return [...this.controllers.values()]; }
}
