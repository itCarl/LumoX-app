import { EventEmitter } from 'node:events';
import { createLogger } from '../util/logger';
import type { Output, OutputConfig } from './Output';
import type { Universe } from '../core/Universe';

const log = createLogger('OutputManager');

/** Constructor signature for an Output subclass with a static TYPE. */
export interface OutputClass {
  TYPE: string;
  new (config?: OutputConfig): Output;
}

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
  static _types: Map<string, OutputClass> = new Map();

  outputs: Map<string, Output>;

  static registerType(klass: OutputClass): void {
    if (!klass.TYPE || klass.TYPE === 'abstract') {
      throw new Error('Output subclass must define static TYPE');
    }
    OutputManager._types.set(klass.TYPE, klass);
  }

  static availableTypes(): string[] {
    return [...OutputManager._types.keys()];
  }

  constructor() {
    super();
    this.outputs = new Map();
  }

  create(typeName: string, config: OutputConfig = {}): Output {
    const Klass = OutputManager._types.get(typeName);
    if (!Klass) throw new Error(`Unknown output type: ${typeName}`);
    const output = new Klass(config);
    this.add(output);
    return output;
  }

  add(output: Output): Output {
    this.outputs.set(output.id, output);
    output.on('error', (err: Error) => {
      log.error(`output ${output.name} (${output.type}):`, err.message);
      this.emit('error', output, err);
    });
    this.emit('added', output);
    return output;
  }

  remove(outputId: string): void {
    const o = this.outputs.get(outputId);
    if (!o) return;
    o.close().catch(() => {});
    this.outputs.delete(outputId);
    this.emit('removed', outputId);
  }

  get(outputId: string): Output | undefined {
    return this.outputs.get(outputId);
  }

  list(): Output[] {
    return [...this.outputs.values()];
  }

  async openAll(): Promise<void> {
    for (const o of this.outputs.values()) {
      try { await o.open(); }
      catch (err) { log.error(`open ${o.name}:`, (err as Error).message); }
    }
  }

  async closeAll(): Promise<void> {
    for (const o of this.outputs.values()) {
      try { await o.close(); }
      catch (err) { log.error(`close ${o.name}:`, (err as Error).message); }
    }
  }

  dispatch(universe: Universe, now: number): void {
    for (const o of this.outputs.values()) o.send(universe, now);
  }
}
