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
 * SavedSelection — a named, ordered subset of fixtures the user has stored to
 * recall later as the live programming selection. Unlike a Group (structural,
 * one channel-config, auto-created on patch), a saved selection is a free,
 * curated *ordered* pick across any fixtures — its order is its whole point, as
 * it becomes the FX fan/phase index when recalled. Membership is by id (survives
 * fixture re-creation, serializes cleanly).
 */
export interface SavedSelection {
  id: string;
  name: string;
  fixtureIds: string[];   // ordered
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
  selections: Map<string, SavedSelection>;
  meta: ShowMeta;

  constructor({ name = 'Untitled Show' }: ShowOptions = {}) {
    this.name = name;
    this.patch = new Patch();
    this.groups = new GroupManager();
    this.library = new FixtureLibrary();
    this.scenes = new Map();
    this.selections = new Map();
    this.meta = { createdAt: Date.now(), version: 1 };
  }

  addScene(scene: Scene): Scene { this.scenes.set(scene.id, scene); return scene; }
  removeScene(id: string): void { this.scenes.delete(id); }
  listScenes(): Scene[]    { return [...this.scenes.values()]; }
  clearScenes(): void      { this.scenes.clear(); }

  // ---- saved selections -------------------------------------------------
  addSelection(sel: SavedSelection): SavedSelection { this.selections.set(sel.id, sel); return sel; }
  removeSelection(id: string): void { this.selections.delete(id); }
  listSelections(): SavedSelection[] { return [...this.selections.values()]; }
  clearSelections(): void { this.selections.clear(); }
  /** Drop a fixture id from every saved selection (use when a fixture is deleted). */
  purgeFixtureFromSelections(fixtureId: string): void {
    for (const s of this.selections.values()) s.fixtureIds = s.fixtureIds.filter((id) => id !== fixtureId);
  }
}
