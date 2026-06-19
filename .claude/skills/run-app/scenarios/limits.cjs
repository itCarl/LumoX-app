// F2 — per-fixture limits clamp the engine output. Drives a mover to full via the
// live programmer, applies limits, and reads the universe buffer back to confirm
// the clamp (numeric assertion; the visual lives in the `limits-tile` scenario).

module.exports = {
  async run({ js, waitFor, step }) {
    await waitFor(`window.lumox && document.querySelector('.pg-tile')`, 'patch grid');

    const result = await js(`(async () => {
      const fixtures = await window.lumox.patch.list();
      const find = (f, t) => (f.channels.find((c) => c.typeId === t) || {}).index || 0;
      const intens = (f) => (f.channels.find((c) => ['intensity','intensity-master','dimmer'].includes(c.typeId)) || {}).index || 0;
      const fx = fixtures.find((f) => find(f, 'pan') && find(f, 'tilt') && intens(f));
      if (!fx) return { err: 'no mover with pan+tilt+dimmer found' };
      const panI = find(fx, 'pan'), tiltI = find(fx, 'tilt'), dimI = intens(fx);
      const addr = (i) => fx.startAddress + i - 1;
      await window.lumox.fixtures.setChannel(fx.id, panI, 255);
      await window.lumox.fixtures.setChannel(fx.id, tiltI, 255);
      await window.lumox.fixtures.setChannel(fx.id, dimI, 255);
      await new Promise((r) => setTimeout(r, 120));
      const before = await window.lumox.universes.read(fx.universeId);
      await window.lumox.fixtures.setLimits([fx.id], { dimmer: { max: 100 }, tilt: { min: 0, max: 60 }, pan: { min: 0, max: 255, invert: true } });
      await new Promise((r) => setTimeout(r, 120));
      const after = await window.lumox.universes.read(fx.universeId);
      return {
        name: fx.name,
        dim:  { before: before[addr(dimI)-1],  after: after[addr(dimI)-1] },
        tilt: { before: before[addr(tiltI)-1], after: after[addr(tiltI)-1] },
        pan:  { before: before[addr(panI)-1],  after: after[addr(panI)-1] },
      };
    })()`);
    step('result: ' + JSON.stringify(result));
    if (result && !result.err) {
      const ok = result.dim.after <= 100 && result.tilt.after <= 60 && result.pan.after <= 10;
      step('CLAMP ' + (ok ? 'PASS' : 'FAIL') + ' (dimmer<=100, tilt<=60, pan inverted~0)');
    }
  },
};
