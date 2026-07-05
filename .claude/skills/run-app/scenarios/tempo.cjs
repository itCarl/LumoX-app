// F10 BPM source UI — titlebar clock (manual), the Settings panel's Tempo
// section, and the titlebar after switching the source to MIDI (locked + source
// chip). Settings opens as its own panel WINDOW (renderer/panel.html), so the
// Tempo section is captured from that window, not the main one.

module.exports = {
  cover: '01-titlebar-manual',
  async run({ js, waitFor, shoot, findPanel, sleep, step }) {
    await waitFor(`document.getElementById('bpm-clock')`, 'bpm clock');

    // 1) titlebar, manual source (default — chip hidden)
    await shoot('01-titlebar-manual', 'header');

    // 2) open Settings (Ctrl+,) — a panel window — and capture the Tempo section
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true }))`);
    const panel = await findPanel();
    if (!panel) throw new Error('settings panel window never opened');
    await panel.waitFor(`[...document.querySelectorAll('.lx-form-head')].some(h => h.textContent === 'Tempo')`, 'Tempo section');
    await sleep(400);
    await panel.shoot('02-settings-tempo');
    panel.win.close();
    await sleep(300);

    // 3) switch source to MIDI → titlebar locks + shows the source chip
    step('setSource(midi) → ' + JSON.stringify(await js(`window.lumox.transport.setSource('midi', null)`)));
    await sleep(500);
    await shoot('03-titlebar-midi', 'header');

    // restore manual so settings.json is left clean for the next run
    await js(`window.lumox.transport.setSource('manual')`);
    await sleep(200);
  },
};
