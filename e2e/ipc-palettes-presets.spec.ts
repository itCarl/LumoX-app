import { test, expect, ipc } from './fixtures';

// Colour palettes + FX-rack presets IPC.
test.describe('palette IPC', () => {
  test('list has built-ins; add → rename → remove a user palette', async ({ page }) => {
    const builtins = await ipc<any[]>(page, 'palettes.list');
    expect(builtins.length).toBeGreaterThan(0);

    const added = await ipc<any>(page, 'palettes.add', 'E2E Palette', ['#ff0000', '#00ff00', '#0000ff']);
    expect(added.colors).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    expect((await ipc<any[]>(page, 'palettes.list')).some((p) => p.id === added.id)).toBe(true);

    await ipc(page, 'palettes.rename', added.id, 'E2E Renamed');
    expect((await ipc<any[]>(page, 'palettes.list')).find((p) => p.id === added.id).name).toBe('E2E Renamed');

    await ipc(page, 'palettes.remove', added.id);
    expect((await ipc<any[]>(page, 'palettes.list')).some((p) => p.id === added.id)).toBe(false);
  });

  test('invalid hex values are filtered out', async ({ page }) => {
    const added = await ipc<any>(page, 'palettes.add', 'E2E Filter', ['#ff0000', 'nothex', '#00ff00']);
    expect(added.colors).toEqual(['#ff0000', '#00ff00']);
    await ipc(page, 'palettes.remove', added.id);
  });
});

test.describe('FX-rack preset IPC', () => {
  let sid: string;
  test.beforeEach(async ({ page }) => {
    sid = (await ipc<any>(page, 'scenes.capture', undefined, 'E2E Preset Src')).id;
    await ipc(page, 'scenes.addLayer', sid, 'color');   // a rack to save
  });
  test.afterEach(async ({ page }) => { await ipc(page, 'scenes.remove', sid).catch(() => {}); });

  test('saveRack → applyRack to another scene → rename → remove', async ({ page }) => {
    const preset = await ipc<any>(page, 'presets.saveRack', sid, 'E2E Preset');
    expect(preset).toBeTruthy();
    expect((await ipc<any[]>(page, 'presets.list')).some((p) => p.id === preset.id)).toBe(true);

    const dest = await ipc<any>(page, 'scenes.capture', undefined, 'E2E Preset Dest');
    const applied = await ipc<any>(page, 'presets.applyRack', dest.id, preset.id);
    expect(applied.layers.length).toBeGreaterThan(0);
    expect(applied.layers[0].kind).toBe('color');
    expect(applied.layers[0].id).not.toBe((await ipc<any>(page, 'scenes.get', sid)).layers[0].id);   // fresh layer id

    await ipc(page, 'presets.rename', preset.id, 'E2E Preset Renamed');
    expect((await ipc<any[]>(page, 'presets.list')).find((p) => p.id === preset.id).name).toBe('E2E Preset Renamed');

    await ipc(page, 'presets.remove', preset.id);
    expect((await ipc<any[]>(page, 'presets.list')).some((p) => p.id === preset.id)).toBe(false);
    await ipc(page, 'scenes.remove', dest.id);
  });

  test('saveRack on a layerless scene returns null', async ({ page }) => {
    const empty = await ipc<any>(page, 'scenes.capture', undefined, 'E2E Empty');
    expect(await ipc(page, 'presets.saveRack', empty.id, 'nope')).toBeNull();
    await ipc(page, 'scenes.remove', empty.id);
  });
});
