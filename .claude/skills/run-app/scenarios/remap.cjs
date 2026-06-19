// Pan range-remap numeric check (no screenshots) — a pan limit of [64,192]
// should map input 0/128/255 to output ~64/~128/~192.

module.exports = {
  async run({ js, waitFor, step }) {
    await waitFor(`window.lumox && document.querySelector('.pg-tile')`, 'patch grid');
    const r = await js(`(async () => {
      const fx = (await window.lumox.patch.list()).find(f => f.channels.some(c => c.typeId === 'pan'));
      const panI = fx.channels.find(c => c.typeId === 'pan').index, abs = fx.startAddress + panI - 1;
      await window.lumox.fixtures.setLimits([fx.id], { pan: { min: 64, max: 192, invert: false } });
      const read = async (v) => { await window.lumox.fixtures.setChannel(fx.id, panI, v); await new Promise(r => setTimeout(r, 100)); return (await window.lumox.universes.read(fx.universeId))[abs - 1]; };
      return { at0: await read(0), at128: await read(128), at255: await read(255) };
    })()`);
    step('remap: ' + JSON.stringify(r));
    step('expect ~64 / ~128 / ~192 → ' + (Math.abs(r.at0 - 64) <= 2 && Math.abs(r.at128 - 128) <= 3 && Math.abs(r.at255 - 192) <= 2 ? 'PASS' : 'FAIL'));
  },
};
