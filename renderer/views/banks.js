// Banks tile (CONTROL view, top-left) — banks hold scenes. Bank tabs + a
// column per bank: header, transport, and stacked scene cells. The column “+”
// captures the current live output into a new scene in that bank.

const { lumox } = window;

export async function makeBanksTile() {
  const tile = document.createElement('section');
  tile.className = 'tile bank-tile';
  tile.innerHTML = `
    <div class="bank-tabs" id="bk-tabs"></div>
    <div class="bank-cols tile-body" id="bk-cols"></div>`;

  const tabsEl = tile.querySelector('#bk-tabs');
  const colsEl = tile.querySelector('#bk-cols');
  let active = null;

  async function reload() {
    let banks = [];
    try { banks = await lumox.banks.list(); } catch { banks = []; }
    if (!banks.length) return;
    if (!banks.some((b) => b.id === active)) active = banks[0].id;

    tabsEl.innerHTML = banks.map((b) =>
      `<button class="bk-tab${b.id === active ? ' active' : ''}" data-bank="${b.id}">${b.name}</button>`).join('')
      + `<button class="bk-tab bk-add" id="bk-add" title="Add bank">+</button>`;

    colsEl.innerHTML = banks.map((b) => `
      <div class="bank-col" data-bank="${b.id}">
        <div class="bank-col-head">${b.name}</div>
        <div class="bank-col-transport">
          <button class="bk-t" title="Pause" disabled>⏸</button>
          <button class="bk-t" title="Prev" disabled>⏮</button>
          <button class="bk-t" title="Next" disabled>⏭</button>
          <button class="bk-t bk-cap" data-bank="${b.id}" title="Capture scene">+</button>
        </div>
        <div class="bank-scenes">
          ${b.scenes.map((s) => `
            <div class="scene-cell${s.active ? ' active' : ''}" data-scene="${s.id}">
              <div class="sc-name">${s.name}</div>
              <div class="sc-type">STATIC</div>
              <div class="sc-bar"><div class="sc-bar-fill" style="height:${Math.round(s.opacity * 100)}%"></div></div>
            </div>`).join('')}
        </div>
      </div>`).join('');

    tabsEl.querySelectorAll('.bk-tab[data-bank]').forEach((t) =>
      t.addEventListener('click', () => { active = t.dataset.bank; reload(); }));
    tabsEl.querySelector('#bk-add').addEventListener('click', async () => {
      const b = await lumox.banks.add();
      active = b.id; reload();
    });

    colsEl.querySelectorAll('.bk-cap').forEach((b) =>
      b.addEventListener('click', async () => { await lumox.scenes.capture(b.dataset.bank); reload(); }));

    colsEl.querySelectorAll('.scene-cell').forEach((el) => {
      el.addEventListener('click', async () => {
        const bank = banks.find((bb) => bb.scenes.some((s) => s.id === el.dataset.scene));
        const s = bank?.scenes.find((x) => x.id === el.dataset.scene);
        await lumox.scenes.recall(el.dataset.scene, !s?.active);
        reload();
      });
      el.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        if (confirm(`Delete scene "${el.querySelector('.sc-name').textContent}"?`)) {
          await lumox.scenes.remove(el.dataset.scene);
          reload();
        }
      });
    });
  }

  await reload();
  return { tile, refresh: reload };
}
