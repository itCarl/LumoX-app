import { test, expect, ipc } from './fixtures';

// Transport (tempo), audio-reactive bindings, and MIDI control-surface IPC.
test.describe('transport IPC', () => {
  test.afterEach(async ({ page }) => {
    await ipc(page, 'transport.setSource', 'manual').catch(() => {});
    await ipc(page, 'transport.setBpm', 120).catch(() => {});
  });

  test('get returns a status with bpm + source', async ({ page }) => {
    const s = await ipc<any>(page, 'transport.get');
    expect(typeof s.bpm).toBe('number');
    expect(['manual', 'midi', 'audio', 'link']).toContain(s.source);
  });

  test('setBpm sets + clamps to the 20–300 range', async ({ page }) => {
    expect(await ipc<number>(page, 'transport.setBpm', 145)).toBe(145);
    expect(await ipc<number>(page, 'transport.setBpm', 5)).toBeGreaterThanOrEqual(20);
    expect(await ipc<number>(page, 'transport.setBpm', 9000)).toBeLessThanOrEqual(300);
  });

  test('setSource switches the active clock', async ({ page }) => {
    const s = await ipc<any>(page, 'transport.setSource', 'audio');
    expect(s.source).toBe('audio');
    expect((await ipc<any>(page, 'transport.setSource', 'manual')).source).toBe('manual');
  });

  test('audioBpm + midiInputs are callable', async ({ page }) => {
    expect(typeof await ipc<number>(page, 'transport.audioBpm', 128)).toBe('number');
    expect(Array.isArray(await ipc(page, 'transport.midiInputs'))).toBe(true);
  });
});

test.describe('audio binding IPC', () => {
  test('targets include master + blackout', async ({ page }) => {
    const targets = await ipc<any[]>(page, 'audio.targets');
    const keys = targets.map((t) => t.key);
    expect(keys).toContain('master');
    expect(keys).toContain('blackout');
  });

  test('add → set → setOptions → remove a binding', async ({ page }) => {
    const before = (await ipc<any[]>(page, 'audio.listBindings')).length;
    const b = await ipc<any>(page, 'audio.addBinding', { type: 'band', index: 0 }, { key: 'master', label: 'Grand master', kind: 'range', min: 0, max: 1 });
    expect(b).toBeTruthy();
    expect((await ipc<any[]>(page, 'audio.listBindings')).length).toBe(before + 1);

    await ipc(page, 'audio.setBinding', b.id, { source: { type: 'volume' } });
    await ipc(page, 'audio.setBindingOptions', b.id, { invert: true, curve: 'exp' });
    const now = (await ipc<any[]>(page, 'audio.listBindings')).find((x) => x.id === b.id);
    expect(now.source.type).toBe('volume');
    expect(now.options.invert).toBe(true);

    await ipc(page, 'audio.removeBinding', b.id);
    expect((await ipc<any[]>(page, 'audio.listBindings')).length).toBe(before);
  });
});

test.describe('MIDI IPC', () => {
  test('status reports a (possibly disconnected) surface', async ({ page }) => {
    const s = await ipc<any>(page, 'midi.status');
    expect(s).toHaveProperty('connected');
    expect(typeof s.connected).toBe('boolean');
  });

  test('listBindings returns an array', async ({ page }) => {
    expect(Array.isArray(await ipc(page, 'midi.listBindings'))).toBe(true);
  });

  test('begin / cancel assign mode does not throw', async ({ page }) => {
    await ipc(page, 'midi.beginAssign');
    await ipc(page, 'midi.cancelAssign');
  });
});
