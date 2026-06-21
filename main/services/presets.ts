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

// Curated built-in colour palettes — modern multi-stop gradients shipped with the
// app so the COLOR / MATRIX FX palette picker is useful out of the box (it would
// otherwise be empty until the user saves their own). Inspired by the well-known
// LED-control gradient palettes plus a couple of perceptual data-viz ramps. These
// live OUTSIDE the Store: they are read-only (never renamed/removed/persisted) and
// are merged ahead of the user's saved palettes by the `palettes:list` handler.
// Ids are stable (`builtin_<slug>`) so the renderer can tell them apart.
export const BUILTIN_PALETTES: readonly Palette[] = [
  { id: 'builtin_rainbow',   name: 'Rainbow',   colors: ['#ff0040', '#ffd000', '#5cff4a', '#00e0ff', '#6a4bff', '#ff45c8', '#ff0040'] },
  { id: 'builtin_sunset',    name: 'Sunset',    colors: ['#1a0b2e', '#7b2d6b', '#d6456b', '#ff8c42', '#ffd56b'] },
  { id: 'builtin_lava',      name: 'Lava',      colors: ['#000000', '#7a0000', '#e22b00', '#ff8c00', '#ffe08a'] },
  { id: 'builtin_magma',     name: 'Magma',     colors: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'] },
  { id: 'builtin_amber',     name: 'Amber',     colors: ['#2b1700', '#7a4a12', '#c98a2b', '#ffce73', '#fff2cf'] },
  { id: 'builtin_peach',     name: 'Peach',     colors: ['#ff5e62', '#ff9966', '#ffcf8e'] },
  { id: 'builtin_ocean',     name: 'Ocean',     colors: ['#001b29', '#003b5c', '#0277a8', '#00b4d8', '#90e0ef'] },
  { id: 'builtin_pacifica',  name: 'Pacifica',  colors: ['#0a1f2b', '#0e4d5c', '#1b8a8f', '#36c9a3', '#a7f3d0'] },
  { id: 'builtin_ice',       name: 'Ice',       colors: ['#0b2540', '#1d4e89', '#4aa3df', '#a8d8ff', '#eaf6ff'] },
  { id: 'builtin_aurora',    name: 'Aurora',    colors: ['#001a2b', '#0a3d62', '#1dd3b0', '#7cffcb', '#b388ff'] },
  { id: 'builtin_tiamat',    name: 'Tiamat',    colors: ['#01051a', '#142a8a', '#1b9aaa', '#a020f0', '#ff2ec4'] },
  { id: 'builtin_forest',    name: 'Forest',    colors: ['#062a1e', '#0e5a36', '#2e9e54', '#8fd14f', '#e4f6a0'] },
  { id: 'builtin_sakura',    name: 'Sakura',    colors: ['#fff0f6', '#ffc2d9', '#ff8fb1', '#ff5e9c', '#c1447e'] },
  { id: 'builtin_tropical',  name: 'Tropical',  colors: ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff'] },
  { id: 'builtin_party',     name: 'Party',     colors: ['#ff0066', '#ff6f00', '#ffd500', '#cc00ff', '#3300ff'] },
  { id: 'builtin_neon',      name: 'Neon',      colors: ['#ff00e5', '#7a00ff', '#00e5ff', '#00ff85'] },
  { id: 'builtin_pastel',    name: 'Pastel',    colors: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff'] },
  { id: 'builtin_synthwave', name: 'Synthwave', colors: ['#0d0221', '#ff2a6d', '#d300c5', '#05d9e8', '#f9f871'] },
  { id: 'builtin_viridis',   name: 'Viridis',   colors: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
  { id: 'builtin_candy',     name: 'Candy Cane', colors: ['#b80000', '#ffffff', '#b80000', '#ffffff'] },
];

let seq = 0;
export const newId = (prefix: string): string => `${prefix}_${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
