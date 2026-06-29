// Create matrix / strip — verifies the matrix generator end to end: open the
// panel from the library tile, screenshot the live preview, create a 10×5 RGB
// matrix through the real Create button, patch it, and confirm it resolves into
// 50 addressable cells on the stage.

const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow } = require('electron');

async function findPanel(tries = 60) {
  for (let i = 0; i < tries; i++) {
    const w = BrowserWindow.getAllWindows().find((b) => {
      try { return b.webContents.getURL().includes('panel.html'); } catch { return false; }
    });
    if (w && !w.webContents.isLoading()) return w;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

module.exports = {
  cover: 'matrix-02-panel',
  async run({ js, waitFor, shoot, dev, sleep, step, OUT }) {
    // Library tile lives in the SETUP tab.
    await js(`document.querySelector('.tb-tab[data-tab="setup"]').click()`);
    await waitFor(`document.querySelector('.lib-tile')`, 'library tile');
    await waitFor(`document.querySelector('.lib-head-right button[title="Create matrix / strip"]')`, 'create-matrix button');
    await shoot('matrix-01-library-head', '.lib-tile .tile-head', 4);

    // Open the panel window.
    await js(`document.querySelector('.lib-head-right button[title="Create matrix / strip"]').click()`);
    const panel = await findPanel();
    if (!panel) throw new Error('create-matrix panel window never opened');
    const pwc = panel.webContents;
    await pwc.executeJavaScript(`(async () => { for (let i = 0; i < 40; i++) { if (document.querySelector('.cm-grid i')) return; await new Promise(r => setTimeout(r, 50)); } })()`, true);
    await sleep(300);

    // Defaults are a 10×5 RGB matrix — read the live readout + preview cell count.
    const cells = await pwc.executeJavaScript(`document.querySelectorAll('.cm-grid i').length`, true);
    const readout = await pwc.executeJavaScript(`document.querySelector('.cm-readout').textContent`, true);
    step('preview cells: ' + cells + ' | readout: ' + readout);

    // Screenshot the panel window itself.
    panel.showInactive();
    let img = null;
    for (let i = 0; i < 6 && !img; i++) {
      try { const c = await pwc.capturePage(); if (c.getSize().width > 0) img = c; } catch (e) { step('panel capture retry ' + i + ': ' + e.message); }
      if (!img) await sleep(400);
    }
    if (img) { fs.writeFileSync(path.join(OUT, 'matrix-02-panel.png'), img.toPNG()); step('wrote matrix-02-panel.png'); }

    // Create it for real (closes the window).
    await pwc.executeJavaScript(`document.querySelector('.cm-create').click()`, true);
    await sleep(600);

    // The new Custom fixture should exist in the library.
    const userDefs = await dev(`return show.library.list().filter(d => d.source === 'user').map(d => ({ id: d.id, model: d.model, emitters: d.emitters }))`);
    step('user defs: ' + JSON.stringify(userDefs));
    const def = userDefs.find((d) => /Matrix 10x5/.test(d.model));
    if (!def) throw new Error('generated matrix not found in library');

    // Patch it through the REAL library-tile flow (expand Custom accordion →
    // select the matrix → pick an empty universe → PATCH), so PATCH_CHANGED fires
    // and the stage auto-centres the new fixture — the same path a user drives.
    const occ = await dev(`return (() => { const m = {}; for (const f of show.patch.list()) m[f.universeId] = (m[f.universeId]||0)+1; return m; })()`);
    step('occupancy by universe: ' + JSON.stringify(occ));
    const patchUni = await js(`(async () => {
      const acc = [...document.querySelectorAll('.acc')].find((a) => a.querySelector('.acc-name')?.textContent === 'Custom');
      if (!acc) return 'no-custom-accordion';
      if (acc.classList.contains('collapsed')) acc.querySelector('.acc-head').click();
      for (let i = 0; i < 40 && !document.querySelector('.tree-item[data-def="${def.id}"]'); i++) await new Promise(r => setTimeout(r, 50));
      const item = document.querySelector('.tree-item[data-def="${def.id}"]');
      if (!item) return 'no-tree-item';
      item.click();
      for (let i = 0; i < 40 && !document.querySelector('#ld-patch'); i++) await new Promise(r => setTimeout(r, 50));
      const uniSel = document.querySelector('#ld-uni');
      if (!uniSel) return 'no-detail-form';
      const occ = ${JSON.stringify(occ)};
      const empty = [...uniSel.options].map(o => Number(o.value)).find(v => !occ[v]);
      if (empty != null) { uniSel.value = String(empty); uniSel.dispatchEvent(new Event('change')); }
      await new Promise(r => setTimeout(r, 200));
      document.querySelector('#ld-patch').click();
      return uniSel.value;
    })()`);
    step('patched via library tile on universe ' + patchUni);
    await sleep(700);

    // Engine resolves the patched matrix into 50 cells with 50 world positions,
    // and the stage auto-centred it (transform off the 0,0 origin).
    const patched = await dev(`return (() => {
      const f = show.patch.list().find(f => f.definition.id === ${JSON.stringify(def.id)});
      if (!f) return null;
      const t = f.stageTransform;
      const ws = f.emitterWorldPositions();
      const cx = ws.reduce((s, p) => s + p.x, 0) / ws.length;
      const cy = ws.reduce((s, p) => s + p.y, 0) / ws.length;
      return { name: f.name, emitters: f.emitterCount, colors: f.emitterColorAddresses().length, worlds: ws.length, span: f.mode.channelCount, transform: t, centroid: { x: Math.round(cx), y: Math.round(cy) } };
    })()`);
    step('patched matrix: ' + JSON.stringify(patched));
    if (!patched || patched.emitters !== 50 || patched.worlds !== 50) throw new Error('matrix did not resolve into 50 cells: ' + JSON.stringify(patched));
    if (patched.transform.x === 0 && patched.transform.y === 0) throw new Error('matrix was not auto-centred — still at origin');

    await js(`document.querySelector('.tb-tab[data-tab="setup"]').click()`);
    await sleep(500);
    await shoot('matrix-03-stage', '.stage-tile');
    await shoot('matrix-04-window');
  },
};
