// F1 group order — screenshot of the group fixture-order editor opened from the
// group bar's context menu. The editor lives in its own panel WINDOW
// (renderer/panel.html), so the shot is taken from that window.

module.exports = {
  cover: 'f1-group-order',
  async run({ js, waitFor, findPanel, sleep, step }) {
    await waitFor(`window.lumox && document.querySelector('.pg-tile')`, 'patch grid');

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

    const panel = await findPanel();
    if (!panel) throw new Error('group-order panel window never opened');
    await panel.waitFor(`document.querySelector('.ord-list .ord-row')`, 'order list');
    await sleep(300);
    await panel.shoot('f1-group-order');
    panel.win.close();
    await sleep(150);
  },
};
