import { EventEmitter } from 'node:events';
import { Universe } from './Universe.js';

/**
 * UniverseManager — keyed store of Universe instances.
 * Events:
 *   'added'   (universe)
 *   'removed' (universeId)
 */
export class UniverseManager extends EventEmitter {
  constructor() {
    super();
    this.universes = new Map();
  }

  ensure(id, name) {
    let u = this.universes.get(id);
    if (!u) {
      u = new Universe(id, name);
      this.universes.set(id, u);
      this.emit('added', u);
    }
    return u;
  }

  get(id) {
    return this.universes.get(id);
  }

  remove(id) {
    if (this.universes.delete(id)) this.emit('removed', id);
  }

  list() {
    return [...this.universes.values()].sort((a, b) => a.id - b.id);
  }

  clearDirty() {
    for (const u of this.universes.values()) u.dirty = false;
  }
}
