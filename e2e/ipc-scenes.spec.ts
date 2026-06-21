import { test, expect, ipc } from './fixtures';

// Scene lifecycle + properties IPC. Each test works on a DISPOSABLE captured scene
// and removes it afterwards, so the demo show's 55 scenes stay intact.
test.describe('scene IPC', () => {
  let sid: string;
  test.beforeEach(async ({ page }) => {
    const s = await ipc<any>(page, 'scenes.capture', undefined, 'E2E Scene');
    sid = s.id;
  });
  test.afterEach(async ({ page }) => { await ipc(page, 'scenes.remove', sid).catch(() => {}); });

  test('capture adds a scene; list + get reflect it', async ({ page }) => {
    expect((await ipc<any[]>(page, 'scenes.list')).some((s) => s.id === sid)).toBe(true);
    const dto = await ipc<any>(page, 'scenes.get', sid);
    expect(dto.name).toBe('E2E Scene');
    expect(dto.type).toBe('static');
  });

  test('rename + setColor', async ({ page }) => {
    await ipc(page, 'scenes.rename', sid, 'E2E New Name');
    await ipc(page, 'scenes.setColor', sid, '#22aaff');
    const dto = await ipc<any>(page, 'scenes.get', sid);
    expect(dto.name).toBe('E2E New Name');
    expect(dto.color.toLowerCase()).toBe('#22aaff');
  });

  test('recall toggles the active flag', async ({ page }) => {
    await ipc(page, 'scenes.recall', sid, true);
    await expect.poll(() => ipc<any>(page, 'scenes.get', sid).then((s) => s.active)).toBe(true);
    await ipc(page, 'scenes.recall', sid, false);
    await expect.poll(() => ipc<any>(page, 'scenes.get', sid).then((s) => s.active)).toBe(false);
  });

  test('duplicate creates an independent copy', async ({ page }) => {
    const copy = await ipc<any>(page, 'scenes.duplicate', sid);
    expect(copy.id).not.toBe(sid);
    expect(copy.name).toMatch(/copy/);
    await ipc(page, 'scenes.remove', copy.id);
  });

  test('setChannel writes + clears a stored value', async ({ page }) => {
    const fx = (await ipc<any[]>(page, 'patch.list'))[0];
    await ipc(page, 'scenes.setChannel', sid, fx.id, 1, 222);
    let values = await ipc<any>(page, 'scenes.values', sid);
    const abs = fx.startAddress;   // channel 1 → absolute = startAddress
    expect(values[fx.universeId][abs]).toBe(222);
    await ipc(page, 'scenes.setChannel', sid, fx.id, 1, null);
    values = await ipc<any>(page, 'scenes.values', sid);
    expect(values[fx.universeId]?.[abs]).toBeUndefined();
  });

  test('static → chase seeds a step; step CRUD + timing', async ({ page }) => {
    const dto = await ipc<any>(page, 'scenes.setType', sid, 'chase');
    expect(dto.type).toBe('chase');
    expect(dto.stepCount).toBeGreaterThanOrEqual(1);

    const n = await ipc<number>(page, 'scenes.addStep', sid);
    expect(n).toBeGreaterThanOrEqual(2);
    const timing = await ipc<any>(page, 'scenes.setStepTiming', sid, 0, { fadeMs: 1500, waitMs: 250 });
    expect(timing).toEqual({ fadeMs: 1500, waitMs: 250 });
    const moved = await ipc<number>(page, 'scenes.moveStep', sid, 0, 1);
    expect(moved).toBe(1);
    const left = await ipc<number>(page, 'scenes.removeStep', sid, 0);
    expect(left).toBe(n - 1);

    await ipc(page, 'scenes.setRate', sid, 750);
    expect((await ipc<any>(page, 'scenes.get', sid)).type).toBe('chase');
  });

  test('playback properties — level / speed / fade / drive / direction / startMode', async ({ page }) => {
    expect((await ipc<any>(page, 'scenes.setLevel', sid, 0.5)).level).toBeCloseTo(0.5, 5);
    expect((await ipc<any>(page, 'scenes.setSpeed', sid, 2)).speed).toBe(2);
    expect((await ipc<any>(page, 'scenes.setFade', sid, { fadeIn: 3, fadeOut: 1.5 })).fadeIn).toBe(3);
    expect((await ipc<any>(page, 'scenes.setDrive', sid, { mode: 'bpm', beatDiv: 2 })).driveMode).toBe('bpm');
    expect((await ipc<any>(page, 'scenes.setDirection', sid, 'bounce')).direction).toBe('bounce');
    expect((await ipc<any>(page, 'scenes.setStartMode', sid, 'random')).startMode).toBe('random');
  });

  test('advanced properties — priority / loop / jumpTo / release / protect / flash', async ({ page }) => {
    expect((await ipc<any>(page, 'scenes.setPriority', sid, 'high')).priority).toBe('high');
    const loop = await ipc<any>(page, 'scenes.setLoop', sid, { mode: 'count', count: 4 });
    expect(loop.loop).toEqual({ mode: 'count', count: 4 });
    expect((await ipc<any>(page, 'scenes.setJumpTo', sid, { mode: 'next' })).jumpTo).toEqual({ mode: 'next' });
    expect((await ipc<any>(page, 'scenes.setReleaseAtEnd', sid, true)).releaseAtEnd).toBe(true);
    expect((await ipc<any>(page, 'scenes.setReleaseMode', sid, { mode: 'bank' })).releaseMode).toBe('bank');
    expect((await ipc<any>(page, 'scenes.setProtect', sid, { mode: 'all' })).protectFromRelease).toBe('all');
    expect((await ipc<any>(page, 'scenes.setFlash', sid, true)).flash).toBe(true);
  });

  test('transport pause / resume reflects paused state', async ({ page }) => {
    await ipc(page, 'scenes.setType', sid, 'chase');
    await ipc(page, 'scenes.recall', sid, true);
    const paused = await ipc<any>(page, 'scenes.transport', sid, 'pause');
    expect(paused.paused).toBe(true);
    const resumed = await ipc<any>(page, 'scenes.transport', sid, 'resume');
    expect(resumed.paused).toBe(false);
    await ipc(page, 'scenes.recall', sid, false);
  });
});
