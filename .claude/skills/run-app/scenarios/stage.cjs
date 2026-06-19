// F1 ordered selection — index badges on the stage + patch grid, numbered in the
// order fixtures are clicked. Drives the SETUP tab.

module.exports = {
  cover: 'stage-01-selected',
  async run({ js, waitFor, shoot, sleep, step }) {
    await waitFor(`document.querySelector('.stage-tile')`, 'stage tile');
    await waitFor(`document.querySelectorAll('.st-node').length > 3`, 'stage nodes');

    await js(`document.querySelector('.tb-tab[data-tab="setup"]').click()`);
    await sleep(400);

    // Build an ORDERED selection by clicking 5 nodes (first plain, rest shift-add).
    const n = await js(`(() => {
      let count = 0;
      for (let i = 0; i < 5; i++) {
        // Re-query each click: the stage rebuilds its DOM on every selection
        // change, so a cached node reference detaches after the first click.
        const node = document.querySelectorAll('.st-node')[i];
        if (!node) break;
        node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: i > 0 }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        count++;
      }
      return count;
    })()`);
    step('selected nodes: ' + n);
    await sleep(500);
    step('main selection length: ' + await js(`window.lumox.selection.get().then(ids => ids.length)`));

    await shoot('stage-01-selected', '.stage-tile');
    await shoot('stage-02-patchgrid', '.pg-tile');
    await shoot('stage-03-window');
  },
};
