import { test, expect, ipc } from './fixtures';

// Bank IPC — ordered scene containers.
test.describe('bank IPC', () => {
  test('list returns the demo banks with their scenes', async ({ page }) => {
    const banks = await ipc<any[]>(page, 'banks.list');
    expect(banks.length).toBeGreaterThan(1);
    for (const b of banks) {
      expect(b).toHaveProperty('name');
      expect(Array.isArray(b.scenes)).toBe(true);
    }
  });

  test('add → rename → capture into → remove (drops its scenes)', async ({ page }) => {
    const before = (await ipc<any[]>(page, 'banks.list')).length;
    const bank = await ipc<any>(page, 'banks.add', 'E2E Bank');
    expect(bank.name).toBe('E2E Bank');
    expect((await ipc<any[]>(page, 'banks.list')).length).toBe(before + 1);

    await ipc(page, 'banks.rename', bank.id, 'E2E Bank Renamed');
    const scene = await ipc<any>(page, 'scenes.capture', bank.id, 'In Bank');
    const renamed = (await ipc<any[]>(page, 'banks.list')).find((b) => b.id === bank.id);
    expect(renamed.name).toBe('E2E Bank Renamed');
    expect(renamed.scenes.some((s: any) => s.id === scene.id)).toBe(true);

    // Removing the bank removes its scenes too.
    await ipc(page, 'banks.remove', bank.id);
    expect((await ipc<any[]>(page, 'banks.list')).length).toBe(before);
    expect((await ipc<any[]>(page, 'scenes.list')).some((s) => s.id === scene.id)).toBe(false);
  });
});
