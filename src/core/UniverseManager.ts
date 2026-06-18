import { EventEmitter } from 'node:events';
import { Universe } from './Universe';

/**
 * UniverseManager — keyed store of Universe instances.
 * Events:
 *   'added'   (universe)
 *   'removed' (universeId)
 */
export class UniverseManager extends EventEmitter {
  universes: Map<number, Universe>;

  constructor() {
    super();
    this.universes = new Map();
  }

  ensure(id: number, name?: string): Universe {
    let u = this.universes.get(id);
    if (!u) {
      u = new Universe(id, name);
      this.universes.set(id, u);
      this.emit('added', u);
    }
    return u;
  }

  get(id: number): Universe | undefined {
    return this.universes.get(id);
  }

  remove(id: number): void {
    if (this.universes.delete(id)) this.emit('removed', id);
  }

  list(): Universe[] {
    return [...this.universes.values()].sort((a, b) => a.id - b.id);
  }

  clearDirty(): void {
    for (const u of this.universes.values()) u.dirty = false;
  }
}
