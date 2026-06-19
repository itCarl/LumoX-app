// F1 group order + F2 channel flags — numeric check that follows-dimmer scales a
// colour channel by the dimmer, plus screenshots of the group-order editor and
// the Limits modal's Channels section.

module.exports = {
  cover: 'f1-group-order',
  async run({ js, waitFor, shoot, sleep, step }) {
    await waitFor(`window.lumox && document.querySelector('.pg-tile')`, 'patch grid');

    // Numeric: a colour channel flagged "follows dimmer" is scaled by the dimmer.
    const r = await js(`(async () => {
      const fixtures = await window.lumox.patch.list();
      const idx = (f, t) => (f.channels.find((c) => c.typeId === t) || {}).index || 0;
      const dimIdx = (f) => { const c = f.channels.find((c) => ['intensity','intensity-master','dimmer'].includes(c.typeId)); return c ? c.index : 0; };
      const fx = fixtures.find((f) => idx(f, 'red') && dimIdx(f));
      if (!fx) return { err: 'no rgb+dimmer fixture' };
      const redI = idx(fx, 'red'), dI = dimIdx(fx);
      const abs = (i) => fx.startAddress + i - 1;
      await window.lumox.fixtures.setChannel(fx.id, redI, 255);
      await window.lumox.fixtures.setChannel(fx.id, dI, 128);
      await new Promise((r) => setTimeout(r, 120));
      const before = (await window.lumox.universes.read(fx.universeId))[abs(redI) - 1];
      await window.lumox.fixtures.setChannelFlag([fx.id], redI, 'dimmer', true);
      await new Promise((r) => setTimeout(r, 120));
      const after = (await window.lumox.universes.read(fx.universeId))[abs(redI) - 1];
      return { name: fx.name, redBefore: before, redAfter: after, expected: Math.round(255 * 128 / 255) };
    })()`);
    step('follows-dimmer: ' + JSON.stringify(r));
    if (r && !r.err) step('FOLLOWS-DIMMER ' + (Math.abs(r.redAfter - r.expected) <= 2 ? 'PASS' : 'FAIL') + ` (red ${r.redBefore}→${r.redAfter}, expected ~${r.expected})`);

    // F1: open the group-order editor from the group bar.
    await js(`document.querySelector('.tb-tab[data-tab="setup"]').click()`);
    await sleep(300);
    const gOpened = await js(`(async () => {
      const groups = await window.lumox.groups.list();
      const g = groups.find((x) => x.fixtureIds.length > 1) || groups[0];
      if (!g) return false;
      const tab = document.querySelector('.gb-tab[data-grp="' + g.id + '"]');
      if (!tab) return false;
      tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 300 }));
      await new Promise((r) => setTimeout(r, 250));
      const it = [...document.querySelectorAll('.ctx-menu [data-mi]')].find((e) => e.textContent.trim().startsWith('Edit order'));
      if (it) { it.click(); return true; }
      return false;
    })()`);
    step('group-order opened: ' + gOpened);
    await sleep(500);
    await shoot('f1-group-order', '.lx-modal-backdrop');
    await js(`document.querySelector('.lx-modal-backdrop')?.remove()`);
    await sleep(150);

    // F2 visual: channel-flag pills render in the LIMITS tile (limits/flags are
    // set there now, not via a context-menu modal). Select the flagged fixture so
    // its "follows dimmer" pill shows.
    await js(`(async () => {
      const fixtures = await window.lumox.patch.list();
      const idx = (f, t) => (f.channels.find((c) => c.typeId === t) || {}).index || 0;
      const dimIdx = (f) => { const c = f.channels.find((c) => ['intensity','intensity-master','dimmer'].includes(c.typeId)); return c ? c.index : 0; };
      const fx = fixtures.find((f) => idx(f, 'red') && dimIdx(f)) || fixtures[0];
      const cell = document.querySelector('.pg-tile .cell.fx[data-fx="' + fx.id + '"]');
      if (cell) cell.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    })()`);
    await sleep(500);
    await shoot('f2-channel-flags', '.limits-tile');
  },
};
