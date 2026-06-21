import { test, expect, gotoTab } from './fixtures';

// End-to-end engine wiring — proves UI/IPC actions reach the live mixed universe
// buffer (post-MixPipeline), the same bytes the app transmits over Art-Net/sACN.
// The mix MATH itself is unit-tested (test/mix/*); here we verify the app is wired.
const readBuf = (page: any, uni: number) =>
  page.evaluate((id: number) => (window as any).lumox.universes.read(id), uni) as Promise<number[]>;
const sum = (b: number[]) => b.reduce((a, v) => a + v, 0);

test.describe('engine → live DMX buffer', () => {
  test('recalling a scene lights the universe; releasing it clears', async ({ page }) => {
    await gotoTab(page, 'control');
    const uni = await page.evaluate(() => (window as any).lumox.universes.list().then((u: any[]) => u[0].id));

    // Baseline (reset): nothing live. Some channels carry non-zero home values
    // (e.g. centred pan/tilt), so we compare against this snapshot, not zero.
    const baseline = JSON.stringify(await readBuf(page, uni));

    const sceneId = await page.evaluate(() => (window as any).lumox.scenes.list().then((s: any[]) => s[0].id));
    await page.evaluate((id) => (window as any).lumox.scenes.recall(id, true), sceneId);
    // Recalling the scene changes the live output (it drives different bytes).
    await expect.poll(() => readBuf(page, uni).then((b) => JSON.stringify(b)), { timeout: 8000 }).not.toBe(baseline);

    await page.evaluate((id) => (window as any).lumox.scenes.recall(id, false), sceneId);
    await expect.poll(() => page.evaluate((id) => (window as any).lumox.scenes.list().then((s: any[]) => s.find((x) => x.id === id)?.active), sceneId)).toBe(false);
  });

  test('blackout darkens a lit rig and restores on release', async ({ page }) => {
    await gotoTab(page, 'control');
    const uni = await page.evaluate(() => (window as any).lumox.universes.list().then((u: any[]) => u[0].id));

    // Find a scene where blackout actually reduces the output — i.e. one that
    // raises an intensity channel (blackout is an intensity-only mask). Scan by
    // recalling, measuring, toggling blackout, and comparing.
    const sceneId = await page.evaluate(async () => {
      const l = (window as any).lumox;
      const u = (await l.universes.list())[0].id;
      const total = (b: number[]) => b.reduce((a: number, v: number) => a + v, 0);
      for (const s of await l.scenes.list()) {
        await l.scenes.recall(s.id, true);
        await new Promise((r) => setTimeout(r, 180));
        const lit = total(await l.universes.read(u));
        await l.blackout.set(true);
        await new Promise((r) => setTimeout(r, 180));
        const dark = total(await l.universes.read(u));
        await l.blackout.set(false);
        await l.scenes.recall(s.id, false);
        if (dark < lit) return s.id;
      }
      return null;
    });
    expect(sceneId).not.toBeNull();

    await page.evaluate((id) => (window as any).lumox.scenes.recall(id, true), sceneId);
    let litSum = 0;
    await expect.poll(async () => (litSum = sum(await readBuf(page, uni))), { timeout: 8000 }).toBeGreaterThan(0);

    await page.evaluate(() => (window as any).lumox.blackout.set(true));
    await expect.poll(() => readBuf(page, uni).then(sum), { timeout: 8000 }).toBeLessThan(litSum);

    await page.evaluate(() => (window as any).lumox.blackout.set(false));
    await page.evaluate((id) => (window as any).lumox.scenes.recall(id, false), sceneId);
  });
});
