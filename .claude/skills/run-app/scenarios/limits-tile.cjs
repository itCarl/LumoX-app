// Limits tile (SETUP bottom-right) — selects a mover so the pan/tilt range box,
// dimmer-cap bar, and channel-flag pills all render.

module.exports = {
  cover: 'limits-tile',
  async run({ js, waitFor, shoot, sleep, step }) {
    await waitFor(`window.lumox && document.querySelector('.limits-tile')`, 'limits tile');
    await js(`document.querySelector('.tb-tab[data-tab="setup"]').click()`);
    await sleep(300);
    // Pre-set limits, then select the mover by clicking its patch cell (the real
    // path — emits FIXTURE_SELECTED, which the tile reacts to).
    const n = await js(`(async () => {
      const fixtures = await window.lumox.patch.list();
      const fx = fixtures.find((f) => f.channels.some((c) => c.typeId === 'pan') && f.channels.some((c) => c.typeId === 'tilt'));
      if (!fx) return 0;
      await window.lumox.fixtures.setLimits([fx.id], { dimmer:{max:180}, pan:{min:40,max:210,invert:false}, tilt:{min:20,max:150,invert:true} });
      const cell = document.querySelector('.pg-tile .cell.fx[data-fx="' + fx.id + '"]');
      if (cell) cell.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
      return cell ? 1 : 0;
    })()`);
    step('selected mover: ' + n);
    await sleep(500);
    await shoot('limits-tile', '.limits-tile');
    await shoot('limits-tile-window', '.workspace');
  },
};
