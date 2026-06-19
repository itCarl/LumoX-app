// presets.ts — reusable named colour palettes + saved FX-rack presets. Held as
// app singletons (like the bank manager) and persisted with the project. A
// palette is a named hex-colour list; a preset is a named copy of a scene's FX
// rack (its layers) that can be applied to any scene.

import type { FxLayer } from '../../src/index';

export interface Palette { id: string; name: string; colors: string[]; }
export interface Preset { id: string; name: string; layers: FxLayer[]; }

class Store<T extends { id: string; name: string }> {
  private items = new Map<string, T>();
  list(): T[] { return [...this.items.values()]; }
  get(id: string): T | undefined { return this.items.get(id); }
  add(item: T): T { this.items.set(item.id, item); return item; }
  remove(id: string): void { this.items.delete(id); }
  rename(id: string, name: string): void { const i = this.items.get(id); if (i && name) i.name = name; }
  clear(): void { this.items.clear(); }
  load(arr: T[] | undefined): void { this.clear(); for (const it of arr ?? []) if (it?.id) this.items.set(it.id, it); }
  toJSON(): T[] { return this.list(); }
}

export const palettes = new Store<Palette>();
export const presets = new Store<Preset>();

let seq = 0;
export const newId = (prefix: string): string => `${prefix}_${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
