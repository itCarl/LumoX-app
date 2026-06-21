import { test, expect, ipc } from './fixtures';

// FX-rack layer IPC — add every layer kind, edit target / order / timing / enable,
// and the kind-specific config. Works on a disposable captured scene.
test.describe('FX rack IPC', () => {
  let sid: string;
  test.beforeEach(async ({ page }) => { sid = (await ipc<any>(page, 'scenes.capture', undefined, 'E2E FX')).id; });
  test.afterEach(async ({ page }) => { await ipc(page, 'scenes.remove', sid).catch(() => {}); });

  const KINDS = ['color', 'move', 'curve', 'chaser', 'value', 'matrix'] as const;
  for (const kind of KINDS) {
    test(`add a ${kind} layer`, async ({ page }) => {
      const { scene, layerId } = await ipc<any>(page, 'scenes.addLayer', sid, kind);
      const layer = scene.layers.find((l: any) => l.id === layerId);
      expect(layer.kind).toBe(kind);
      expect(layer[kind]).toBeTruthy();   // kind-specific config block present
    });
  }

  test('enable / target / order edits round-trip', async ({ page }) => {
    const { layerId } = await ipc<any>(page, 'scenes.addLayer', sid, 'move');
    const grp = (await ipc<any[]>(page, 'groups.list'))[0];

    let s = await ipc<any>(page, 'scenes.setLayerEnabled', sid, layerId, false);
    expect(s.layers.find((l: any) => l.id === layerId).enabled).toBe(false);

    s = await ipc<any>(page, 'scenes.setLayerTarget', sid, layerId, 'selection');
    expect(s.layers.find((l: any) => l.id === layerId).target.mode).toBe('selection');
    s = await ipc<any>(page, 'scenes.setLayerTarget', sid, layerId, 'group', grp.id);
    expect(s.layers.find((l: any) => l.id === layerId).target).toEqual({ mode: 'group', groupId: grp.id });

    s = await ipc<any>(page, 'scenes.setLayerOrder', sid, layerId, 'reverse');
    expect(s.layers.find((l: any) => l.id === layerId).order).toBe('reverse');
  });

  test('timing edits (speed / size / spread / direction / drive)', async ({ page }) => {
    const { layerId } = await ipc<any>(page, 'scenes.addLayer', sid, 'move');
    const s = await ipc<any>(page, 'scenes.setLayerTiming', sid, layerId, { speed: 3, size: 64, spread: 180, direction: 'backward', driveMode: 'bpm', beatDiv: 2 });
    const l = s.layers.find((x: any) => x.id === layerId);
    expect(l.speed).toBe(3);
    expect(l.size).toBe(64);
    expect(l.spread).toBe(180);
    expect(l.direction).toBe('backward');
    expect(l.driveMode).toBe('bpm');
  });

  test('kind-specific config — color', async ({ page }) => {
    const { layerId } = await ipc<any>(page, 'scenes.addLayer', sid, 'color');
    const s = await ipc<any>(page, 'scenes.setLayerConfig', sid, layerId, { saturation: 0.5, grayscale: true, angle: 90, palette: ['#ff0000', '#00ff00'] });
    const c = s.layers.find((l: any) => l.id === layerId).color;
    expect(c.saturation).toBeCloseTo(0.5, 5);
    expect(c.grayscale).toBe(true);
    expect(c.angle).toBe(90);
    expect(c.palette).toEqual(['#ff0000', '#00ff00']);
  });

  test('kind-specific config — move / curve / chaser / value / matrix', async ({ page }) => {
    const move = await ipc<any>(page, 'scenes.addLayer', sid, 'move');
    expect((await ipc<any>(page, 'scenes.setLayerConfig', sid, move.layerId, { shape: 'circle', sizeX: 0.5 }))
      .layers.find((l: any) => l.id === move.layerId).move.shape).toBe('circle');

    const curve = await ipc<any>(page, 'scenes.addLayer', sid, 'curve');
    expect((await ipc<any>(page, 'scenes.setLayerConfig', sid, curve.layerId, { waveform: 'square', min: 10, max: 200 }))
      .layers.find((l: any) => l.id === curve.layerId).curve.waveform).toBe('square');

    const chaser = await ipc<any>(page, 'scenes.addLayer', sid, 'chaser');
    expect((await ipc<any>(page, 'scenes.setLayerConfig', sid, chaser.layerId, { litCount: 3, gap: 1 }))
      .layers.find((l: any) => l.id === chaser.layerId).chaser.litCount).toBe(3);

    const value = await ipc<any>(page, 'scenes.addLayer', sid, 'value');
    expect((await ipc<any>(page, 'scenes.setLayerConfig', sid, value.layerId, { staticValue: 128 }))
      .layers.find((l: any) => l.id === value.layerId).value.staticValue).toBe(128);

    const matrix = await ipc<any>(page, 'scenes.addLayer', sid, 'matrix');
    expect((await ipc<any>(page, 'scenes.setLayerConfig', sid, matrix.layerId, { pattern: 'wipe', saturation: 0.5 }))
      .layers.find((l: any) => l.id === matrix.layerId).matrix.pattern).toBe('wipe');
  });

  test('move + remove reorder the rack', async ({ page }) => {
    const a = (await ipc<any>(page, 'scenes.addLayer', sid, 'color')).layerId;
    const b = (await ipc<any>(page, 'scenes.addLayer', sid, 'move')).layerId;
    let s = await ipc<any>(page, 'scenes.get', sid);
    expect(s.layers.map((l: any) => l.id)).toEqual([a, b]);

    s = await ipc<any>(page, 'scenes.moveLayer', sid, b, -1);
    expect(s.layers.map((l: any) => l.id)).toEqual([b, a]);

    s = await ipc<any>(page, 'scenes.removeLayer', sid, a);
    expect(s.layers.map((l: any) => l.id)).toEqual([b]);
  });
});
