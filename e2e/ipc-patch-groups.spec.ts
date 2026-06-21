import { test, expect, ipc } from './fixtures';

// Patch + group IPC — exercised end-to-end through the real main process. Every
// mutation round-trips (create → assert → clean up) so the demo show stays stable.
test.describe('patch IPC', () => {
  test('list returns the seeded rig with addressing', async ({ page }) => {
    const fixtures = await ipc<any[]>(page, 'patch.list');
    expect(fixtures.length).toBe(24);
    for (const f of fixtures) {
      expect(f).toHaveProperty('id');
      expect(f).toHaveProperty('definitionId');
      expect(f.startAddress).toBeGreaterThanOrEqual(1);
      expect(f.endAddress).toBeGreaterThanOrEqual(f.startAddress);
    }
  });

  test('add → rename → move → remove a fixture (own universe)', async ({ page }) => {
    const seed = (await ipc<any[]>(page, 'patch.list'))[0];
    // Patch onto an empty high universe so address packing is trivial + isolated.
    const created = await ipc<any[]>(page, 'patch.add', {
      definitionId: seed.definitionId, modeId: seed.modeId, universeId: 9, startAddress: 1, count: 1, name: 'E2E Fixture',
    });
    expect(created).toHaveLength(1);
    const id = created[0].id;
    expect(created[0].name).toBe('E2E Fixture');

    await ipc(page, 'patch.rename', id, 'E2E Renamed');
    let list = await ipc<any[]>(page, 'patch.list');
    expect(list.find((f) => f.id === id)?.name).toBe('E2E Renamed');

    const moved = await ipc<any>(page, 'patch.move', { id, universeId: 9, startAddress: 20 });
    expect(moved.startAddress).toBe(20);

    await ipc(page, 'patch.remove', id);
    list = await ipc<any[]>(page, 'patch.list');
    expect(list.find((f) => f.id === id)).toBeUndefined();
    expect(list.length).toBe(24);
  });

  test('overlapping add is rejected', async ({ page }) => {
    const seed = (await ipc<any[]>(page, 'patch.list'))[0];
    const c = await ipc<any[]>(page, 'patch.add', { definitionId: seed.definitionId, modeId: seed.modeId, universeId: 11, startAddress: 1, count: 1 });
    const id = c[0].id;
    await expect(ipc(page, 'patch.add', { definitionId: seed.definitionId, modeId: seed.modeId, universeId: 11, startAddress: 1, count: 1 }))
      .rejects.toThrow(/already patched/);
    await ipc(page, 'patch.remove', id);
  });

  test('overlaps detection returns an array', async ({ page }) => {
    expect(Array.isArray(await ipc(page, 'patch.overlaps'))).toBe(true);
  });
});

test.describe('group IPC', () => {
  test('list returns the auto-groups with members + colour', async ({ page }) => {
    const groups = await ipc<any[]>(page, 'groups.list');
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g).toHaveProperty('color');
      expect(Array.isArray(g.fixtureIds)).toBe(true);
    }
  });

  test('add (same-config) → rename → setFixtures → remove', async ({ page }) => {
    // Seed members from an existing auto-group (guaranteed same channel config).
    const src = (await ipc<any[]>(page, 'groups.list')).find((g) => g.fixtureIds.length >= 2);
    expect(src).toBeTruthy();
    const before = (await ipc<any[]>(page, 'groups.list')).length;

    const g = await ipc<any>(page, 'groups.add', { name: 'E2E Group', fixtureIds: src.fixtureIds.slice(0, 2) });
    expect(g.name).toBe('E2E Group');
    expect((await ipc<any[]>(page, 'groups.list')).length).toBe(before + 1);

    await ipc(page, 'groups.rename', g.id, 'E2E Renamed', '#11cc88');
    let now = (await ipc<any[]>(page, 'groups.list')).find((x) => x.id === g.id);
    expect(now.name).toBe('E2E Renamed');
    expect(now.color.toLowerCase()).toBe('#11cc88');

    await ipc(page, 'groups.setFixtures', g.id, [src.fixtureIds[0]]);
    now = (await ipc<any[]>(page, 'groups.list')).find((x) => x.id === g.id);
    expect(now.fixtureIds).toEqual([src.fixtureIds[0]]);

    await ipc(page, 'groups.remove', g.id);
    expect((await ipc<any[]>(page, 'groups.list')).length).toBe(before);
  });

  test('mixed-config group is rejected', async ({ page }) => {
    const groups = await ipc<any[]>(page, 'groups.list');
    const a = groups.find((g) => g.fixtureIds.length);
    const b = groups.find((g) => g.fixtureIds.length && g.configKey !== a.configKey);
    test.skip(!b, 'demo rig has only one channel configuration');
    await expect(ipc(page, 'groups.add', { name: 'bad', fixtureIds: [a.fixtureIds[0], b.fixtureIds[0]] }))
      .rejects.toThrow(/same channel configuration/);
  });
});
