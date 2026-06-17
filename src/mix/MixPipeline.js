import { EventEmitter } from 'node:events';

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
  constructor() {
    super();
    this.modules = [];
  }

  add(module) {
    this.modules.push(module);
    this.emit('changed');
    return module;
  }

  insertAt(index, module) {
    this.modules.splice(index, 0, module);
    this.emit('changed');
    return module;
  }

  remove(idOrModule) {
    const id = typeof idOrModule === 'string' ? idOrModule : idOrModule?.id;
    const i = this.modules.findIndex((m) => m.id === id);
    if (i >= 0) {
      this.modules.splice(i, 1);
      this.emit('changed');
    }
  }

  /** Move module to a new position. */
  move(idOrModule, newIndex) {
    const id = typeof idOrModule === 'string' ? idOrModule : idOrModule?.id;
    const i = this.modules.findIndex((m) => m.id === id);
    if (i < 0) return;
    const [m] = this.modules.splice(i, 1);
    this.modules.splice(newIndex, 0, m);
    this.emit('changed');
  }

  get(id) { return this.modules.find((m) => m.id === id); }

  list() { return [...this.modules]; }

  /** Run pipeline against one universe. Mutates `universe.data`. */
  process(universe, ctx) {
    for (const m of this.modules) {
      if (m.enabled) m.process(universe, ctx);
    }
  }
}
