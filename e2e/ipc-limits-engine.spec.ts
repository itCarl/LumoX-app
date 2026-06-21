import { test, expect, ipc } from './fixtures';

// Deterministic engine wiring via the programmer: engage one real intensity
// channel, then verify GrandMaster scaling and the per-fixture dimmer Limit reach
// the live mixed buffer. (The mix MATH is unit-tested in test/mix/*.)
test.describe('limits + engine DMX', () => {
  let fxId: string, uni: number, abs: number, chIndex: number;

  test.beforeEach(async ({ page }) => {
    const fixtures = await ipc<any[]>(page, 'patch.list');
    const fx = fixtures.find((f) => f.channels.some((c: any) => c.isIntensity && !c.isVirtual && c.index <= f.channelCount));
    expect(fx, 'demo rig has a fixture with a real intensity channel').toBeTruthy();
    const ch = fx.channels.find((c: any) => c.isIntensity && !c.isVirtual && c.index <= fx.channelCount);
    fxId = fx.id; uni = fx.universeId; chIndex = ch.index; abs = fx.startAddress + ch.index - 1;
  });

  test.afterEach(async ({ page }) => {
    await ipc(page, 'fixtures.clearLimits', [fxId]).catch(() => {});
    await ipc(page, 'fixtures.clearProgrammer').catch(() => {});
    await ipc(page, 'master.set', 255).catch(() => {});
  });

  const buf = (page: any) => ipc<number[]>(page, 'universes.read', uni).then((b) => b[abs - 1]);

  test('engine reports running', async ({ page }) => {
    const s = await ipc<any>(page, 'engine.status');
    expect(s.running).toBe(true);
    expect(s.refreshHz).toBeGreaterThan(0);
  });

  test('programmer engage drives the channel; clear releases it', async ({ page }) => {
    await ipc(page, 'fixtures.setChannel', fxId, chIndex, 255);
    await expect.poll(() => buf(page), { timeout: 6000 }).toBe(255);

    const summary = await ipc<any>(page, 'fixtures.programmer');
    expect(summary).toBeTruthy();

    await ipc(page, 'fixtures.releaseChannel', fxId, chIndex);
    await expect.poll(() => buf(page), { timeout: 6000 }).not.toBe(255);
  });

  test('GrandMaster scales the engaged intensity', async ({ page }) => {
    await ipc(page, 'fixtures.setChannel', fxId, chIndex, 255);
    await expect.poll(() => buf(page), { timeout: 6000 }).toBe(255);

    await ipc(page, 'master.set', 0.5);
    await expect.poll(() => buf(page), { timeout: 6000 }).toBeLessThanOrEqual(135);
    expect(await buf(page)).toBeGreaterThanOrEqual(120);

    await ipc(page, 'master.set', 1);
    await expect.poll(() => buf(page), { timeout: 6000 }).toBe(255);
  });

  test('per-fixture dimmer Limit caps the output; clear restores it', async ({ page }) => {
    await ipc(page, 'fixtures.setChannel', fxId, chIndex, 255);
    await expect.poll(() => buf(page), { timeout: 6000 }).toBe(255);

    await ipc(page, 'fixtures.setLimits', [fxId], { dimmer: { max: 128 } });
    await expect.poll(() => buf(page), { timeout: 6000 }).toBeLessThanOrEqual(128);
    expect(await buf(page)).toBeGreaterThan(100);

    await ipc(page, 'fixtures.clearLimits', [fxId]);
    await expect.poll(() => buf(page), { timeout: 6000 }).toBe(255);
  });
});
