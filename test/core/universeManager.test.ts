import { describe, it, expect, vi } from 'vitest';
import { UniverseManager } from '../../src/index';

describe('UniverseManager — keyed store', () => {
  it('ensure creates once and is idempotent for the same id', () => {
    const m = new UniverseManager();
    const a = m.ensure(0);
    const b = m.ensure(0);
    expect(a).toBe(b);
    expect(m.get(0)).toBe(a);
    expect(m.universes.size).toBe(1);
  });

  it('emits "added" only when a new universe is created', () => {
    const m = new UniverseManager();
    const added = vi.fn();
    m.on('added', added);
    m.ensure(2);
    m.ensure(2); // already present — no event
    expect(added).toHaveBeenCalledTimes(1);
  });

  it('remove deletes and emits "removed"; missing ids are silent', () => {
    const m = new UniverseManager();
    const removed = vi.fn();
    m.on('removed', removed);
    m.ensure(5);
    m.remove(5);
    m.remove(5); // already gone
    expect(m.get(5)).toBeUndefined();
    expect(removed).toHaveBeenCalledTimes(1);
  });
});

describe('UniverseManager — ordered view', () => {
  it('list is id-sorted and cached until membership changes', () => {
    const m = new UniverseManager();
    m.ensure(3); m.ensure(1); m.ensure(2);
    const first = m.list();
    expect(first.map((u) => u.id)).toEqual([1, 2, 3]);
    expect(m.list()).toBe(first); // same cached array reference
    m.ensure(0);
    const next = m.list();
    expect(next).not.toBe(first); // cache invalidated on add
    expect(next.map((u) => u.id)).toEqual([0, 1, 2, 3]);
  });

  it('clearDirty resets every universe dirty flag', () => {
    const m = new UniverseManager();
    m.ensure(0).dirty = true;
    m.ensure(1).dirty = true;
    m.clearDirty();
    expect(m.list().every((u) => !u.dirty)).toBe(true);
  });
});
