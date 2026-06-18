import { EventEmitter } from 'node:events';
import type { Universe } from '../core/Universe';
import type { MixModule, MixContext } from './MixModule';

/**
 * MixPipeline — ordered chain of MixModules. Engine runs `.process(universe, ctx)`
 * once per universe per tick. Order matters:
 *
 *   1. BaseLayer        copies programmer → data (start of frame)
 *   2. SceneMixer       HTP-merges active scenes
 *   3. Effects          generators (rainbow, strobe, ...) — additive/HTP
 *   4. GrandMaster      scales output
 *   5. Blackout         zeroes if active
 *
 * Add/remove modules at runtime — order managed by add/insert/move APIs.
 *
 * Events: 'changed' when topology changes.
 */
export class MixPipeline extends EventEmitter {
  modules: MixModule[];

  constructor() {
    super();
    this.modules = [];
  }

  add<T extends MixModule>(module: T): T {
    this.modules.push(module);
    this.emit('changed');
    return module;
  }

  insertAt<T extends MixModule>(index: number, module: T): T {
    this.modules.splice(index, 0, module);
    this.emit('changed');
    return module;
  }

  remove(idOrModule: string | MixModule): void {
    const id = typeof idOrModule === 'string' ? idOrModule : idOrModule?.id;
    const i = this.modules.findIndex((m) => m.id === id);
    if (i >= 0) {
      this.modules.splice(i, 1);
      this.emit('changed');
    }
  }

  /** Move module to a new position. */
  move(idOrModule: string | MixModule, newIndex: number): void {
    const id = typeof idOrModule === 'string' ? idOrModule : idOrModule?.id;
    const i = this.modules.findIndex((m) => m.id === id);
    if (i < 0) return;
    const [m] = this.modules.splice(i, 1);
    this.modules.splice(newIndex, 0, m);
    this.emit('changed');
  }

  get(id: string): MixModule | undefined { return this.modules.find((m) => m.id === id); }

  list(): MixModule[] { return [...this.modules]; }

  /** Run pipeline against one universe. Mutates `universe.data`. */
  process(universe: Universe, ctx: MixContext): void {
    for (const m of this.modules) {
      if (m.enabled) m.process(universe, ctx);
    }
  }
}
