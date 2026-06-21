// F1 group order — screenshot of the group fixture-order editor opened from the
// group bar's context menu.

module.exports = {
  cover: 'f1-group-order',
  async run({ js, waitFor, shoot, sleep, step }) {
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
    await sleep(500);
    await shoot('f1-group-order', '.lx-modal-backdrop');
    await js(`document.querySelector('.lx-modal-backdrop')?.remove()`);
    await sleep(150);
  },
};
