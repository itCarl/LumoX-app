import { Patch } from './Patch';
import { GroupManager } from './GroupManager';
import { FixtureLibrary } from '../fixtures/index';
import type { Scene } from './Scene';

export interface ShowOptions {
  name?: string;
}

export interface ShowMeta {
  createdAt: number;
  version: number;
}

/**
 * Show — top-level project container.
 * Holds Patch, GroupManager, FixtureLibrary (user defs), Scenes,
 * future Chases/Cuelists. Save/Load JSON: keep fields plain & serializable.
 */
export class Show {
  name: string;
  patch: Patch;
  groups: GroupManager;
  library: FixtureLibrary;
  scenes: Map<string, Scene>;
  meta: ShowMeta;

  constructor({ name = 'Untitled Show' }: ShowOptions = {}) {
    this.name = name;
    this.patch = new Patch();
    this.groups = new GroupManager();
    this.library = new FixtureLibrary();
    this.scenes = new Map();
    this.meta = { createdAt: Date.now(), version: 1 };
  }

  addScene(scene: Scene): Scene { this.scenes.set(scene.id, scene); return scene; }
  removeScene(id: string): void { this.scenes.delete(id); }
  listScenes(): Scene[]    { return [...this.scenes.values()]; }
  clearScenes(): void      { this.scenes.clear(); }
}
