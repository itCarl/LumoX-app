import { EventEmitter } from 'node:events';
import { createLogger } from '../util/logger.js';

const log = createLogger('OutputManager');

/**
 * OutputManager — registry of Output instances + factory for plugins.
 * Engine calls `dispatch(universe, now)` once per universe per tick.
 *
 * Plugin registration:
 *   OutputManager.registerType(klass)   — klass.TYPE must be unique
 *   manager.create(typeName, config)    — instantiate by type
 *
 * Events:
 *   'added'   (output)
 *   'removed' (outputId)
 *   'error'   (output, err)
 */
export class OutputManager extends EventEmitter {
  static _types = new Map();

  static registerType(klass) {
    if (!klass.TYPE || klass.TYPE === 'abstract') {
      throw new Error('Output subclass must define static TYPE');
    }
    OutputManager._types.set(klass.TYPE, klass);
  }

  static availableTypes() {
    return [...OutputManager._types.keys()];
  }

  constructor() {
    super();
    this.outputs = new Map();
  }

  create(typeName, config = {}) {
    const Klass = OutputManager._types.get(typeName);
    if (!Klass) throw new Error(`Unknown output type: ${typeName}`);
    const output = new Klass(config);
    this.add(output);
    return output;
  }

  add(output) {
    this.outputs.set(output.id, output);
    output.on('error', (err) => {
      log.error(`output ${output.name} (${output.type}):`, err.message);
      this.emit('error', output, err);
    });
    this.emit('added', output);
    return output;
  }

  remove(outputId) {
    const o = this.outputs.get(outputId);
    if (!o) return;
    o.close().catch(() => {});
    this.outputs.delete(outputId);
    this.emit('removed', outputId);
  }

  get(outputId) {
    return this.outputs.get(outputId);
  }

  list() {
    return [...this.outputs.values()];
  }

  async openAll() {
    for (const o of this.outputs.values()) {
      try { await o.open(); }
      catch (err) { log.error(`open ${o.name}:`, err.message); }
    }
  }

  async closeAll() {
    for (const o of this.outputs.values()) {
      try { await o.close(); }
      catch (err) { log.error(`close ${o.name}:`, err.message); }
    }
  }

  dispatch(universe, now) {
    for (const o of this.outputs.values()) o.send(universe, now);
  }
}
