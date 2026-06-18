/**
 * Patch — registry of Fixture instances (universeId + startAddress).
 *
 * Helpers:
 *   forUniverse(uniId)     fixtures patched to that universe
 *   applyAll(universeMgr)  flush every fixture's current `values` into its
 *                          universe's programmer buffer
 *   intensityChannels()    Map<universeId, Set<channel>> — feed to
 *                          GrandMaster/Blackout for `intensity-only` modes
 *   detectOverlaps()       [[a, b], ...] — fixture id pairs sharing addresses
 */
import type { Fixture } from '../fixtures/Fixture';
import type { UniverseManager } from '../core/UniverseManager';

export class Patch {
  fixtures: Map<string, Fixture>;

  constructor() {
    this.fixtures = new Map();
  }

  add(fixture: Fixture): Fixture { this.fixtures.set(fixture.id, fixture); return fixture; }
  remove(id: string): void   { this.fixtures.delete(id); }
  get(id: string): Fixture | undefined      { return this.fixtures.get(id); }
  list(): Fixture[]       { return [...this.fixtures.values()]; }
  clear(): void           { this.fixtures.clear(); }

  forUniverse(universeId: unknown): Fixture[] {
    return this.list().filter((f) => f.universeId === universeId);
  }

  applyAll(universeManager: UniverseManager): void {
    for (const f of this.fixtures.values()) {
      const u = universeManager.get(f.universeId);
      if (u) f.apply(u);
    }
  }

  intensityChannels(): Map<number, Set<number>> {
    const out = new Map<number, Set<number>>();
    for (const f of this.fixtures.values()) {
      const addrs = f.intensityAddresses();
      if (!addrs.length) continue;
      const uni = f.universeId as number;
      let set = out.get(uni);
      if (!set) { set = new Set(); out.set(uni, set); }
      for (const a of addrs) set.add(a);
    }
    return out;
  }

  detectOverlaps(): Array<[string, string]> {
    const byUni = new Map<unknown, Fixture[]>();
    for (const f of this.fixtures.values()) {
      (byUni.get(f.universeId) ?? byUni.set(f.universeId, []).get(f.universeId)!).push(f);
    }
    const out: Array<[string, string]> = [];
    for (const list of byUni.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (a.endAddress >= b.startAddress && b.endAddress >= a.startAddress) {
            out.push([a.id, b.id]);
          }
        }
      }
    }
    return out;
  }
}
