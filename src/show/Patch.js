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
export class Patch {
  constructor() {
    this.fixtures = new Map();
  }

  add(fixture) { this.fixtures.set(fixture.id, fixture); return fixture; }
  remove(id)   { this.fixtures.delete(id); }
  get(id)      { return this.fixtures.get(id); }
  list()       { return [...this.fixtures.values()]; }

  forUniverse(universeId) {
    return this.list().filter((f) => f.universeId === universeId);
  }

  applyAll(universeManager) {
    for (const f of this.fixtures.values()) {
      const u = universeManager.get(f.universeId);
      if (u) f.apply(u);
    }
  }

  intensityChannels() {
    const out = new Map();
    for (const f of this.fixtures.values()) {
      const addrs = f.intensityAddresses();
      if (!addrs.length) continue;
      let set = out.get(f.universeId);
      if (!set) { set = new Set(); out.set(f.universeId, set); }
      for (const a of addrs) set.add(a);
    }
    return out;
  }

  detectOverlaps() {
    const byUni = new Map();
    for (const f of this.fixtures.values()) {
      (byUni.get(f.universeId) ?? byUni.set(f.universeId, []).get(f.universeId)).push(f);
    }
    const out = [];
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
