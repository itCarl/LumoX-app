import { test, expect } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';

// Fixture editor — emitters are per-mode channel groups (the QLC-style "head"
// model): colour/dimmer roles are detected from the channels in each group.
async function waitEditor(app: ElectronApplication): Promise<Page> {
  const existing = app.windows().find((w) => w.url().endsWith('fixtureeditor.html'));
  const ed = existing ?? (await app.waitForEvent('window', { predicate: (w) => w.url().endsWith('fixtureeditor.html'), timeout: 10_000 }));
  await ed.waitForLoadState('domcontentloaded');
  await ed.waitForSelector('#fe-em-list');
  return ed;
}

test.describe('fixture editor — emitters', () => {
  test('auto-detects one emitter from the default RGB PAR channels', async ({ page, electronApp }) => {
    await page.evaluate(() => (window as any).lumox.editor.open());
    const ed = await waitEditor(electronApp);
    // Default fixture = Dimmer + Red + Green + Blue → a single light cell whose
    // group holds all four channels; the role reads RGB (+ Dim).
    await expect(ed.locator('.fe-em-row')).toHaveCount(1);
    await expect(ed.locator('.fe-em-row .fe-em-chip')).toHaveCount(4);
    await expect(ed.locator('.fe-em-row .fe-em-role')).toContainText('RGB');
    await ed.close();
  });

  test('saved emitter groups round-trip to the patched fixture DTO', async ({ page, electronApp }) => {
    await page.evaluate(() => (window as any).lumox.editor.open());
    const ed = await waitEditor(electronApp);
    await ed.fill('#fe-model', 'E2E Head Fixture');
    await ed.locator('#fe-actions .lx-btn-primary').click();   // Save (closes the window)
    await page.waitForTimeout(300);

    // Find the saved Custom def, patch it on an empty universe, read its DTO heads.
    const heads = await page.evaluate(async () => {
      const l = (window as any).lumox;
      const def = (await l.library.list()).find((d: any) => d.model === 'E2E Head Fixture');
      if (!def) return null;
      const created = await l.patch.add({ definitionId: def.id, universeId: 9, startAddress: 1, count: 1 });
      const id = created[0].id;
      const fx = (await l.patch.list()).find((f: any) => f.id === id);
      const heads = fx?.heads ?? null;
      await l.patch.remove(id);          // clean up the patched fixture
      await l.library.remove(def.id);    // and the Custom def
      return heads;
    });
    expect(heads).toEqual([[1, 2, 3, 4]]);
  });
});
