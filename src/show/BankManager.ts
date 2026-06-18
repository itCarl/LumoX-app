import { EventEmitter } from 'node:events';

/** Bank — ordered container of scene ids (CONTROL view). */
export interface Bank {
  id: string;
  name: string;
  sceneIds: string[];
}

/** Serialized bank (project file). */
export interface BankJSON {
  id: string;
  name: string;
  sceneIds: string[];
}

/**
 * BankManager — ordered list of Banks, each a named container of scene ids.
 * Banks group scenes for one-tap recall in the CONTROL view; only one scene
 * per bank is active at a time (enforced by the scene-recall flow, not here).
 *
 * Membership is by scene id, so a removed scene must be purged from its bank
 * (`purgeScene`), and removing a bank orphans its scenes — `remove()` returns
 * their ids so the caller can drop them from the engine/show.
 *
 * Events: 'added' (bank), 'removed' (bankId), 'changed' (bank).
 */
export class BankManager extends EventEmitter {
  banks: Bank[];
  _seq: number;

  constructor() {
    super();
    this.banks = [];
    this._seq = 0;
  }

  list(): Bank[] { return this.banks; }
  get(id: string): Bank | undefined { return this.banks.find((b) => b.id === id); }

  add(name?: string): Bank {
    const b: Bank = { id: `bank_${++this._seq}`, name: name || `Bank ${this.banks.length + 1}`, sceneIds: [] };
    this.banks.push(b);
    this.emit('added', b);
    return b;
  }

  /** Create a default bank if none exist. */
  ensureDefault(): void { if (!this.banks.length) this.add('Bank 1'); }

  rename(id: string, name: string): void {
    const b = this.get(id);
    if (b && name) { b.name = name; this.emit('changed', b); }
  }

  /** Remove a bank; returns the scene ids it held so the caller can clean up. */
  remove(id: string): string[] {
    const i = this.banks.findIndex((b) => b.id === id);
    if (i < 0) return [];
    const orphaned = this.banks[i].sceneIds;
    this.banks.splice(i, 1);
    this.emit('removed', id);
    return orphaned;
  }

  /** Bank that contains a given scene id. */
  bankOf(sceneId: string): Bank | undefined {
    return this.banks.find((b) => b.sceneIds.includes(sceneId));
  }

  /** Append a scene to a bank (falls back to the first bank). */
  addScene(bankId: string, sceneId: string): void {
    const b = this.get(bankId) ?? this.banks[0];
    if (b) b.sceneIds.push(sceneId);
  }

  /** Insert a scene id right after another (used when duplicating a scene). */
  insertAfter(afterSceneId: string, sceneId: string): void {
    const b = this.bankOf(afterSceneId);
    if (b) b.sceneIds.splice(b.sceneIds.indexOf(afterSceneId) + 1, 0, sceneId);
  }

  /** Drop a scene id from every bank (use when a scene is deleted). */
  purgeScene(sceneId: string): void {
    for (const b of this.banks) b.sceneIds = b.sceneIds.filter((id) => id !== sceneId);
  }

  clear(): void { this.banks = []; }

  toJSON(): BankJSON[] {
    return this.banks.map((b) => ({ id: b.id, name: b.name, sceneIds: [...b.sceneIds] }));
  }

  /** Replace all banks from serialized state; keeps `_seq` ahead of loaded ids. */
  load(arr: BankJSON[]): void {
    this.banks = arr.map((b) => ({ id: b.id, name: b.name, sceneIds: [...b.sceneIds] }));
    for (const b of this.banks) {
      const n = Number(b.id.replace(/^bank_/, ''));
      if (Number.isFinite(n) && n > this._seq) this._seq = n;
    }
  }
}
