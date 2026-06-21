import { describe, it, expect } from 'vitest';
import { BankManager } from '../../src/index';

describe('BankManager — bank lifecycle', () => {
  it('add assigns sequential ids and default names', () => {
    const m = new BankManager();
    const a = m.add();
    const b = m.add('Second');
    expect(a.id).toBe('bank_1');
    expect(a.name).toBe('Bank 1');
    expect(b.name).toBe('Second');
    expect(m.list()).toEqual([a, b]);
  });

  it('ensureDefault only creates a bank when none exist', () => {
    const m = new BankManager();
    m.ensureDefault();
    m.ensureDefault();
    expect(m.list()).toHaveLength(1);
  });

  it('rename updates an existing bank, ignores blank names', () => {
    const m = new BankManager();
    const b = m.add();
    m.rename(b.id, 'Renamed');
    expect(m.get(b.id)!.name).toBe('Renamed');
    m.rename(b.id, '');
    expect(m.get(b.id)!.name).toBe('Renamed');
  });

  it('remove returns the orphaned scene ids', () => {
    const m = new BankManager();
    const b = m.add();
    m.addScene(b.id, 's1');
    m.addScene(b.id, 's2');
    expect(m.remove(b.id)).toEqual(['s1', 's2']);
    expect(m.remove('missing')).toEqual([]);
  });
});

describe('BankManager — scene membership', () => {
  it('addScene appends; falls back to the first bank for an unknown id', () => {
    const m = new BankManager();
    const b = m.add();
    m.addScene('nope', 's1'); // unknown bank → first bank
    expect(b.sceneIds).toEqual(['s1']);
  });

  it('bankOf finds the bank holding a scene', () => {
    const m = new BankManager();
    const a = m.add(); const b = m.add();
    m.addScene(b.id, 'x');
    expect(m.bankOf('x')).toBe(b);
    expect(m.bankOf('nope')).toBeUndefined();
    expect(a.sceneIds).toEqual([]);
  });

  it('insertAfter places a scene right after another (duplicate flow)', () => {
    const m = new BankManager();
    const b = m.add();
    m.addScene(b.id, 's1'); m.addScene(b.id, 's2');
    m.insertAfter('s1', 's1b');
    expect(b.sceneIds).toEqual(['s1', 's1b', 's2']);
  });

  it('purgeScene drops a scene id from every bank', () => {
    const m = new BankManager();
    const a = m.add(); const b = m.add();
    m.addScene(a.id, 'x'); m.addScene(b.id, 'x');
    m.purgeScene('x');
    expect(a.sceneIds).toEqual([]);
    expect(b.sceneIds).toEqual([]);
  });
});

describe('BankManager — serialization', () => {
  it('toJSON / load round-trips and keeps the sequence ahead of loaded ids', () => {
    const m = new BankManager();
    m.load([{ id: 'bank_5', name: 'Loaded', sceneIds: ['a'] }]);
    expect(m.toJSON()).toEqual([{ id: 'bank_5', name: 'Loaded', sceneIds: ['a'] }]);
    // next add must not collide with bank_5
    expect(m.add().id).toBe('bank_6');
  });
});
