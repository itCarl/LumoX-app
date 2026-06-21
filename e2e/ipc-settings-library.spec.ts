import { test, expect, ipc } from './fixtures';

// Application settings + fixture-library IPC.
test.describe('settings IPC', () => {
  test('get returns the full preferences object', async ({ page }) => {
    const s = await ipc<any>(page, 'settings.get');
    for (const k of ['language', 'accent', 'dmxProtocol', 'maxRateHz', 'audioBands', 'reopenLastProject']) {
      expect(s).toHaveProperty(k);
    }
  });

  test('update round-trips + clamps, then restores', async ({ page }) => {
    const before = await ipc<any>(page, 'settings.get');
    await ipc(page, 'settings.update', { accent: '#abcdef', audioBands: 16, maxRateHz: 30, reopenLastProject: !before.reopenLastProject });
    const now = await ipc<any>(page, 'settings.get');
    expect(now.accent.toLowerCase()).toBe('#abcdef');
    expect(now.audioBands).toBe(16);
    expect(now.maxRateHz).toBe(30);
    expect(now.reopenLastProject).toBe(!before.reopenLastProject);

    // Out-of-range values clamp.
    await ipc(page, 'settings.update', { audioBands: 999, maxRateHz: 999 });
    const clamped = await ipc<any>(page, 'settings.get');
    expect(clamped.audioBands).toBeLessThanOrEqual(32);
    expect(clamped.maxRateHz).toBeLessThanOrEqual(60);

    // Restore originals.
    await ipc(page, 'settings.update', { accent: before.accent, audioBands: before.audioBands, maxRateHz: before.maxRateHz, reopenLastProject: before.reopenLastProject });
    expect((await ipc<any>(page, 'settings.get')).accent).toBe(before.accent);
  });
});

test.describe('library IPC', () => {
  test('vendors + channelTypes load', async ({ page }) => {
    const vendors = await ipc<any[]>(page, 'library.vendors');
    expect(vendors.length).toBeGreaterThan(0);
    const types = await ipc<any[]>(page, 'library.channelTypes');
    expect(types.length).toBeGreaterThan(0);
    expect(types[0]).toHaveProperty('id');
  });

  test('vendor() lazy-loads a vendor’s fixtures', async ({ page }) => {
    const vendors = await ipc<any[]>(page, 'library.vendors');
    const name = typeof vendors[0] === 'string' ? vendors[0] : vendors[0].name;
    expect(Array.isArray(await ipc(page, 'library.vendor', name))).toBe(true);
  });

  test('add a Custom fixture → remove it', async ({ page }) => {
    const types = await ipc<any[]>(page, 'library.channelTypes');
    const def = { model: 'E2E Probe Fixture', type: 'other', modes: [{ name: '1ch', channels: [{ name: 'Dimmer', typeId: types[0].id }] }] };
    const added = await ipc<any>(page, 'library.add', def);
    expect(added.source).toBe('user');
    expect(added.model).toBe('E2E Probe Fixture');

    const removed = await ipc<any>(page, 'library.remove', added.id);
    expect(removed.ok).toBe(true);
  });

  test('removing a built-in (in-use) fixture is rejected', async ({ page }) => {
    const builtinDefId = (await ipc<any[]>(page, 'patch.list'))[0].definitionId;
    await expect(ipc(page, 'library.remove', builtinDefId)).rejects.toThrow();
  });
});
