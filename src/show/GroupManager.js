import { EventEmitter } from 'node:events';
import { Group } from './Group.js';

/**
 * GroupManager — registry of Group instances keyed by id.
 *
 * Events:
 *   'added'   (group)
 *   'removed' (groupId)
 *   'changed' (group)
 */
export class GroupManager extends EventEmitter {
  constructor() {
    super();
    this.groups = new Map();
  }

  add(groupOrConfig) {
    const g = groupOrConfig instanceof Group ? groupOrConfig : new Group(groupOrConfig);
    this.groups.set(g.id, g);
    this.emit('added', g);
    return g;
  }

  remove(id) {
    if (this.groups.delete(id)) this.emit('removed', id);
  }

  get(id) { return this.groups.get(id); }
  list()  { return [...this.groups.values()]; }

  find({ name, query } = {}) {
    let r = this.list();
    if (name)  r = r.filter((g) => g.name === name);
    if (query) {
      const q = query.toLowerCase();
      r = r.filter((g) => g.id.toLowerCase().includes(q) || g.name.toLowerCase().includes(q));
    }
    return r;
  }

  /** Groups containing a given fixture id. */
  containing(fixtureId) {
    return this.list().filter((g) => g.has(fixtureId));
  }

  /** Remove a fixture id from every group (use when a fixture is deleted). */
  purgeFixture(fixtureId) {
    for (const g of this.groups.values()) {
      if (g.fixtureIds.delete(fixtureId)) this.emit('changed', g);
    }
  }
}
