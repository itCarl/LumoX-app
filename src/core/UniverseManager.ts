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
  /** Cached id-sorted view, invalidated on add/remove. `null` = rebuild needed. */
  private _ordered: Universe[] | null;

  constructor() {
    super();
    this.universes = new Map();
    this._ordered = null;
  }

  ensure(id: number, name?: string): Universe {
    let u = this.universes.get(id);
    if (!u) {
      u = new Universe(id, name);
      this.universes.set(id, u);
      this._ordered = null;
      this.emit('added', u);
    }
    return u;
  }

  get(id: number): Universe | undefined {
    return this.universes.get(id);
  }

  remove(id: number): void {
    if (this.universes.delete(id)) {
      this._ordered = null;
      this.emit('removed', id);
    }
  }

  /**
   * Id-sorted universes. Called every tick by the engine, so the sorted array
   * is cached and only rebuilt when membership changes. The returned array is a
   * shared, read-only view — do not mutate it (callers only iterate/map).
   */
  list(): Universe[] {
    if (!this._ordered) {
      this._ordered = [...this.universes.values()].sort((a, b) => a.id - b.id);
    }
    return this._ordered;
  }

  clearDirty(): void {
    for (const u of this.universes.values()) u.dirty = false;
  }
}
