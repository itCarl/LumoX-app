// Fixture Editor window — standalone page. Authors a user fixture definition
// (manufacturer/model/type/emitters + one mode with an ordered channel list)
// and saves it into the library via window.lumox.

const { lumox } = window;

const FIXTURE_TYPES = ['PAR', 'LED Bar', 'Moving Head', 'Strobe', 'Dimmer', 'Laser', 'Smoke', 'Scanner', 'Other'];

const root = document.getElementById('fe-root');
document.getElementById('ew-close').addEventListener('click', () => lumox?.win.closeSelf());

(async function init() {
  let types = [];
  try { types = await lumox.library.channelTypes(); } catch { types = [{ id: 'intensity', name: 'Intensity', group: 'intensity' }]; }

  const byGroup = new Map();
  for (const t of types) (byGroup.get(t.group) ?? byGroup.set(t.group, []).get(t.group)).push(t);
  const typeOptions = [...byGroup.entries()].map(([g, list]) =>
    `<optgroup label="${g}">${list.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}</optgroup>`).join('');

  root.innerHTML = `
    <div class="fe-meta">
      <label class="frow"><span>Manufacturer</span><input id="fe-mfr" type="text" placeholder="Generic" /></label>
      <label class="frow"><span>Model</span><input id="fe-model" type="text" placeholder="My Fixture" /></label>
      <label class="frow"><span>Type</span>
        <select id="fe-type">${FIXTURE_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label>
      <label class="frow"><span>Emitters</span><input id="fe-emitters" type="number" min="1" max="1024" value="1" /></label>
      <label class="frow"><span>Mode name</span><input id="fe-mode" type="text" value="Default" /></label>
    </div>
    <div class="fe-ch-head">
      <span>Channels</span>
      <button id="fe-add-ch" class="btn-add-ch">+ Add channel</button>
    </div>
    <div id="fe-channels" class="fe-channels"></div>
    <div class="ew-foot">
      <div id="fe-msg" class="fe-msg"></div>
      <div class="modal-actions">
        <button class="btn-ghost" id="fe-cancel">Cancel</button>
        <button class="btn-primary" id="fe-save">Save fixture</button>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const chWrap = $('#fe-channels');

  let chId = 0;
  function addChannel(name = '', typeId = 'intensity') {
    const row = document.createElement('div');
    row.className = 'fe-ch';
    row.dataset.id = ++chId;
    row.innerHTML = `
      <span class="fe-ch-n"></span>
      <input class="fe-ch-name" type="text" placeholder="Channel name" value="${name}" />
      <select class="fe-ch-type">${typeOptions}</select>
      <button class="fe-ch-del" title="Remove">✕</button>`;
    row.querySelector('.fe-ch-type').value = typeId;
    row.querySelector('.fe-ch-del').addEventListener('click', () => { row.remove(); renumber(); });
    chWrap.appendChild(row);
    renumber();
  }
  function renumber() {
    chWrap.querySelectorAll('.fe-ch').forEach((r, i) => { r.querySelector('.fe-ch-n').textContent = i + 1; });
  }

  addChannel('Dimmer', 'intensity');
  addChannel('Red', 'red');
  addChannel('Green', 'green');
  addChannel('Blue', 'blue');

  $('#fe-add-ch').addEventListener('click', () => addChannel());
  $('#fe-cancel').addEventListener('click', () => lumox.win.closeSelf());

  $('#fe-save').addEventListener('click', async () => {
    const msg = $('#fe-msg');
    msg.textContent = '';
    const channels = [...chWrap.querySelectorAll('.fe-ch')].map((r) => ({
      name: r.querySelector('.fe-ch-name').value.trim() || r.querySelector('.fe-ch-type').value,
      typeId: r.querySelector('.fe-ch-type').value,
    }));
    const def = {
      manufacturer: $('#fe-mfr').value.trim(),
      model: $('#fe-model').value.trim(),
      type: $('#fe-type').value,
      emitters: Number($('#fe-emitters').value) || 1,
      modes: [{ name: $('#fe-mode').value.trim() || 'Default', channels }],
    };
    try {
      await lumox.library.add(def);
      lumox.win.closeSelf();
    } catch (err) {
      msg.textContent = String(err.message || err).replace(/^Error:\s*/, '');
    }
  });
})();
