// CONTROL fader editor — default tab, then ALL tab in LIVE with engaged faders,
// then the whole CONTROL window for context.

module.exports = {
  cover: '01-fader-dimmer',
  async run({ js, waitFor, shoot, sleep, step }) {
    await waitFor(`document.querySelector('.fader-tile')`, 'fader tile');
    await waitFor(`document.querySelector('.gb-tabs .gb-tab[data-grp]')`, 'group tabs');

    // CONTROL tab → select the group with the most channels (richest fader set).
    await js(`document.querySelector('.tb-tab[data-tab="control"]').click()`);
    await sleep(500);
    const group = await js(`(async () => {
      const [groups, fixtures] = await Promise.all([window.lumox.groups.list(), window.lumox.patch.list()]);
      const byId = Object.fromEntries(fixtures.map((f) => [f.id, f]));
      let best = null, bestN = -1;
      for (const g of groups) {
        const rep = byId[g.fixtureIds[0]];
        const n = rep ? rep.channels.length : 0;
        if (n > bestN) { bestN = n; best = g; }
      }
      if (!best) return null;
      const tab = document.querySelector('.gb-tabs .gb-tab[data-grp="' + best.id + '"]');
      if (tab) tab.click();
      return best.name + ' (' + bestN + 'ch)';
    })()`);
    step('selected group: ' + group);

    // LIVE renders faders without needing an active scene (EDIT mode needs one).
    await js(`(() => { const b = document.querySelector('.fader-head .seg-btn[data-mode="live"]'); if (b) b.click(); })()`);
    await waitFor(`document.querySelector('.fader-tile .fcol')`, 'faders');
    await sleep(500);

    await shoot('01-fader-dimmer', '.fader-tile');

    // ALL tab + engage every other fader so the on/off engage bars are obvious.
    await js(`(() => { const a = document.querySelector('.fader-tile .fe-attr[data-attr="all"]'); if (a) a.click(); })()`);
    await sleep(300);
    await js(`(() => {
      const f = [...document.querySelectorAll('.fader-tile .fc-fader')];
      const v = [215, 150, 95, 185, 60, 120, 200, 40];
      f.forEach((el, i) => {
        if (i % 2 !== 0) return;
        el.value = v[(i / 2) % v.length];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    })()`);
    await sleep(600);
    await shoot('02-fader-all-live', '.fader-tile');

    await shoot('03-control-window');
  },
};
