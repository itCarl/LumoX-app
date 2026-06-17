import { Patch } from './Patch.js';
import { GroupManager } from './GroupManager.js';
import { FixtureLibrary } from '../fixtures/index.js';

/**
 * Show — top-level project container.
 * Holds Patch, GroupManager, FixtureLibrary (user defs), Scenes,
 * future Chases/Cuelists. Save/Load JSON: keep fields plain & serializable.
 */
export class Show {
  constructor({ name = 'Untitled Show' } = {}) {
    this.name = name;
    this.patch = new Patch();
    this.groups = new GroupManager();
    this.library = new FixtureLibrary();
    this.scenes = new Map();
    this.meta = { createdAt: Date.now(), version: 1 };
  }

  addScene(scene) { this.scenes.set(scene.id, scene); return scene; }
  removeScene(id) { this.scenes.delete(id); }
  listScenes()    { return [...this.scenes.values()]; }
}
