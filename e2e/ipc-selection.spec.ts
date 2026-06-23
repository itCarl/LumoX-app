import { test, expect, ipc } from './fixtures';

// Live selection + saved selections IPC — the ordered programming target.
test.describe('live selection IPC', () => {
  let ids: string[];
  test.beforeEach(async ({ page }) => { ids = (await ipc<any[]>(page, 'patch.list')).map((f) => f.id); });

  test('set / get round-trips an ordered list', async ({ page }) => {
    await ipc(page, 'selection.set', [ids[2], ids[0], ids[1]]);
    expect(await ipc(page, 'selection.get')).toEqual([ids[2], ids[0], ids[1]]);
  });

  test('add / remove mutate the set', async ({ page }) => {
    await ipc(page, 'selection.set', [ids[0]]);
    await ipc(page, 'selection.add', [ids[1], ids[2]]);
    expect(await ipc<string[]>(page, 'selection.get')).toEqual([ids[0], ids[1], ids[2]]);
    await ipc(page, 'selection.remove', [ids[1]]);
    expect(await ipc<string[]>(page, 'selection.get')).toEqual([ids[0], ids[2]]);
  });

  test('all / invert / clear', async ({ page }) => {
    expect(await ipc<string[]>(page, 'selection.all')).toHaveLength(ids.length);   // the whole rig
    await ipc(page, 'selection.set', [ids[0], ids[1]]);
    expect(await ipc<string[]>(page, 'selection.invert')).toHaveLength(ids.length - 2);
    await ipc(page, 'selection.clear');
    expect(await ipc<string[]>(page, 'selection.get')).toHaveLength(0);
  });

  test('reorder moves an entry', async ({ page }) => {
    await ipc(page, 'selection.set', [ids[0], ids[1], ids[2]]);
    const after = await ipc<string[]>(page, 'selection.reorder', 0, 2);
    expect(after).toEqual([ids[1], ids[2], ids[0]]);
  });
});

test.describe('saved selections IPC', () => {
  test('save → recall → rename → setFixtures → remove', async ({ page }) => {
    const ids = (await ipc<any[]>(page, 'patch.list')).map((f) => f.id);
    const before = (await ipc<any[]>(page, 'selections.list')).length;

    const saved = await ipc<any>(page, 'selections.save', [ids[0], ids[1]], 'E2E Pick');
    expect(saved.name).toBe('E2E Pick');
    expect(saved.fixtureIds).toEqual([ids[0], ids[1]]);

    await ipc(page, 'selection.clear');
    const recalled = await ipc<string[]>(page, 'selections.recall', saved.id);
    expect(recalled).toEqual([ids[0], ids[1]]);
    expect(await ipc<string[]>(page, 'selection.get')).toEqual([ids[0], ids[1]]);

    await ipc(page, 'selections.rename', saved.id, 'E2E Renamed');
    await ipc(page, 'selections.setFixtures', saved.id, [ids[3]]);
    const now = (await ipc<any[]>(page, 'selections.list')).find((s) => s.id === saved.id);
    expect(now.name).toBe('E2E Renamed');
    expect(now.fixtureIds).toEqual([ids[3]]);

    await ipc(page, 'selections.remove', saved.id);
    expect((await ipc<any[]>(page, 'selections.list')).length).toBe(before);
  });

  test('saving an empty pick returns null', async ({ page }) => {
    expect(await ipc(page, 'selections.save', [], 'empty')).toBeNull();
  });
});
