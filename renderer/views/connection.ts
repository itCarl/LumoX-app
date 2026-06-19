// Connection view — the DMX output patch (a dedicated I/O page, like a pro
// lighting console). One row per engine universe: protocol (Art-Net / sACN),
// target IP, frame mode (standard / full / partial), rate cap, and on/off, with a
// live transmit indicator. The patch is stored PER PROJECT; edits go through
// `lumox.outputs.setUniverse`. Status is polled while the tab is on screen.

import { html, node, raw } from '../lib/dom';
import { audioEngine, type SpectrumFrame, type Unsubscribe } from '../lib/audio-engine';
import type {
  UniverseOutputRow, DmxProtocol, FrameMode, DiscoveredDevice,
  AudioBinding, AudioSource, AudioTarget, AudioCurve,
} from '../lumox.d';

const { lumox } = window;
const POLL_MS = 1000;

const PROTOS: { id: DmxProtocol; label: string }[] = [
  { id: 'artnet', label: 'Art-Net' },
  { id: 'sacn', label: 'sACN' },
];
const MODES: { id: FrameMode; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'full', label: 'Full' },
  { id: 'partial', label: 'Partial' },
];

export async function makeConnectionView(): Promise<HTMLElement> {
  const el = document.createElement('div');
  el.className = 'cx-view-inner';
  el.innerHTML = `
    <div class="cx-head">
      <span class="cx-title">CONNECTION</span>
      <span class="cx-headsec" id="cx-headsec">DMX output</span>
      <span class="cx-status-pill" id="cx-pill"><span class="cx-dot"></span><span id="cx-pill-text">…</span></span>
    </div>
    <div class="cx-main">
      <nav class="cx-rail" id="cx-rail">
        <button class="cx-railbtn active" data-sec="output" title="DMX output"><i class="fa-solid fa-network-wired"></i><span>Output</span></button>
        <button class="cx-railbtn" data-sec="audio" title="Audio input"><i class="fa-solid fa-wave-square"></i><span>Audio</span></button>
      </nav>
      <div class="cx-sections">
        <section class="cx-section cx-section-output" data-sec="output">
          <div class="cx-split">
            <div class="cx-pane cx-pane-patch">
              <div class="cx-pane-head">
                <span class="cx-pane-title">DMX patch</span>
                <span class="cx-pane-hint">One output per universe · saved with the show</span>
              </div>
              <div class="cx-patch">
                <div class="cx-patch-head">
                  <span>Universe</span><span>Protocol</span><span>Target IP</span><span>Frame mode</span><span>Rate</span><span>On</span><span>Status</span>
                </div>
                <div class="cx-rows" id="cx-patch"></div>
                <button class="cx-add" id="cx-add"><i class="fa-solid fa-plus"></i> Add universe</button>
              </div>
            </div>
            <div class="cx-pane cx-pane-disc">
              <div class="cx-pane-head">
                <span class="cx-pane-title">Network nodes</span>
                <span class="cx-disc-status" id="cx-disc-status"></span>
                <button class="cx-disc-scan" id="cx-disc-scan"><i class="fa-solid fa-magnifying-glass"></i> Scan</button>
              </div>
              <div class="cx-disc-rows" id="cx-disc"></div>
            </div>
          </div>
        </section>
        <section class="cx-section cx-section-audio hidden" data-sec="audio">
          <div class="cx-pane cx-pane-capture">
            <div class="cx-pane-head">
              <span class="cx-pane-title">Capture source</span>
              <span class="cx-audio-status" id="cx-audio-status"></span>
            </div>
            <div class="cx-audio-body">
              <div class="cx-audio-devices" id="cx-audio-devices"></div>
              <div class="cx-audio-slot" id="cx-audio-slot" title="Drag an input here to capture it">
                <div class="cx-audio-slotline">
                  <i class="fa-solid fa-microphone-lines"></i>
                  <span class="cx-audio-name" id="cx-audio-name">System default</span>
                  <button class="cx-audio-clear" id="cx-audio-clear" title="Reset to system default">&times;</button>
                </div>
                <div class="cx-audio-meter">
                  <div class="cx-audio-bars" id="cx-audio-bars"></div>
                  <span class="cx-audio-beat" id="cx-audio-beat" title="Beat"></span>
                </div>
              </div>
            </div>
          </div>
          <div class="cx-pane cx-pane-binds">
            <div class="cx-pane-head">
              <span class="cx-pane-title">Reactive bindings</span>
              <span class="cx-pane-hint">Drive a target from the live audio</span>
              <button class="cx-audio-add" id="cx-audio-add"><i class="fa-solid fa-plus"></i> Add binding</button>
            </div>
            <div class="cx-audio-binds" id="cx-audio-binds"></div>
          </div>
        </section>
      </div>
    </div>`;

  // ---- section rail (Output / Audio — one full-width section at a time) ----
  const railBtns = Array.from(el.querySelectorAll('.cx-railbtn')) as HTMLButtonElement[];
  const sections = Array.from(el.querySelectorAll('.cx-section')) as HTMLElement[];
  const headSec = el.querySelector('#cx-headsec') as HTMLElement;
  const SEC_LABEL: Record<string, string> = { output: 'DMX output', audio: 'Audio input' };
  function showSection(sec: string): void {
    for (const b of railBtns) b.classList.toggle('active', b.dataset.sec === sec);
    for (const s of sections) s.classList.toggle('hidden', s.dataset.sec !== sec);
    headSec.textContent = SEC_LABEL[sec] ?? '';
  }
  for (const b of railBtns) b.addEventListener('click', () => showSection(b.dataset.sec as string));

  const patchEl = el.querySelector('#cx-patch') as HTMLElement;
  const pill = el.querySelector('#cx-pill') as HTMLElement;
  const pillText = el.querySelector('#cx-pill-text') as HTMLElement;
  const addBtn = el.querySelector('#cx-add') as HTMLButtonElement;
  const discEl = el.querySelector('#cx-disc') as HTMLElement;
  const discStatus = el.querySelector('#cx-disc-status') as HTMLElement;
  const scanBtn = el.querySelector('#cx-disc-scan') as HTMLButtonElement;
  const MAX_UNIVERSES = 16;   // matches context.MAX_UNIVERSES (default Art-Net range)
  const SCAN_MS = 120000;     // auto-stop a scan after ~2 minutes

  // Latest patch rows — kept so a discovered node can be matched to a universe.
  let patchRows: UniverseOutputRow[] = [];

  addBtn.addEventListener('click', () => { void lumox.outputs.addUniverse().then(rebuild); });

  // Push one universe's config, then rebuild from the authoritative result.
  const set = (universeId: number, patch: Partial<UniverseOutputRow>) =>
    lumox.outputs.setUniverse({ universeId, ...patch }).then(rebuild).catch(() => {});

  function applyStatus(row: HTMLElement, r: UniverseOutputRow): void {
    const dot = row.querySelector('.cx-rowstat .cx-dot') as HTMLElement;
    const stat = row.querySelector('.cx-rowstat') as HTMLElement;
    dot.className = 'cx-dot' + (r.transmitting ? ' tx' : (r.enabled && r.isOpen) ? ' idle' : '');
    stat.title = !r.enabled ? 'Off' : r.transmitting ? 'Transmitting' : r.isOpen ? 'Idle (no live output)' : 'Closed';
    row.classList.toggle('off', !r.enabled);
  }

  function rowEl(r: UniverseOutputRow): HTMLElement {
    const sacn = r.protocol === 'sacn';
    const row = node(html`
      <div class="cx-row${r.enabled ? '' : ' off'}" data-u="${r.universeId}">
        <span class="cx-u">${r.universeName}</span>
        <select class="cx-sel cx-proto" title="Output protocol">
          ${PROTOS.map((p) => html`<option value="${p.id}" ${p.id === r.protocol ? 'selected' : ''}>${p.label}</option>`)}
        </select>
        <input class="cx-ip" type="text" value="${r.host}" ${sacn ? 'disabled' : ''} placeholder="${sacn ? 'multicast' : '255.255.255.255'}" />
        <select class="cx-sel cx-mode" title="Transmission mode">
          ${MODES.map((m) => html`<option value="${m.id}" ${m.id === r.frameMode ? 'selected' : ''}>${m.label}</option>`)}
        </select>
        <input class="cx-rate" type="number" min="1" max="60" value="${r.maxRateHz}" title="Refresh-rate cap (Hz)" />
        <button class="cx-toggle${r.enabled ? ' on' : ''}" title="${r.enabled ? 'Disable output' : 'Enable output'}"></button>
        <span class="cx-rowstat"><span class="cx-dot"></span></span>
      </div>`);
    const uid = r.universeId;
    (row.querySelector('.cx-proto') as HTMLSelectElement).addEventListener('change', (e) =>
      set(uid, { protocol: (e.target as HTMLSelectElement).value as DmxProtocol }));
    (row.querySelector('.cx-mode') as HTMLSelectElement).addEventListener('change', (e) =>
      set(uid, { frameMode: (e.target as HTMLSelectElement).value as FrameMode }));
    (row.querySelector('.cx-ip') as HTMLInputElement).addEventListener('change', (e) =>
      set(uid, { host: (e.target as HTMLInputElement).value.trim() || '255.255.255.255' }));
    (row.querySelector('.cx-rate') as HTMLInputElement).addEventListener('change', (e) =>
      set(uid, { maxRateHz: Number((e.target as HTMLInputElement).value) || 40 }));
    (row.querySelector('.cx-toggle') as HTMLButtonElement).addEventListener('click', () =>
      set(uid, { enabled: !r.enabled }));
    applyStatus(row, r);
    return row;
  }

  function updatePill(rows: UniverseOutputRow[]): void {
    const tx = rows.filter((r) => r.transmitting).length;
    const on = rows.some((r) => r.enabled && r.isOpen);
    pill.classList.toggle('on', on);
    pillText.textContent = tx ? `Transmitting · ${tx} universe${tx === 1 ? '' : 's'}` : on ? 'Idle' : 'No output';
  }

  // Full rebuild — used on load and after a config edit (which blurs the control).
  async function rebuild(): Promise<void> {
    let rows: UniverseOutputRow[] = [];
    try { rows = await lumox.outputs.patch(); } catch { rows = []; }
    patchRows = rows;
    patchEl.replaceChildren(...rows.map(rowEl));
    addBtn.disabled = rows.length >= MAX_UNIVERSES;
    updatePill(rows);
    renderDiscovery();   // assign targets depend on the current patch
  }

  // Lightweight status refresh — used by the poll, so it never clobbers a control
  // the user is interacting with.
  async function pollStatus(): Promise<void> {
    let rows: UniverseOutputRow[] = [];
    try { rows = await lumox.outputs.patch(); } catch { return; }
    patchRows = rows;
    for (const r of rows) {
      const row = patchEl.querySelector(`.cx-row[data-u="${r.universeId}"]`) as HTMLElement | null;
      if (row && document.activeElement?.closest?.('.cx-row') !== row) applyStatus(row, r);
    }
    updatePill(rows);
  }

  // ---- discovery (Art-Net node finder) ---------------------------------
  // Scanning is manual: the user presses Scan; it auto-stops after SCAN_MS (and on
  // tab hide), releasing the 6454 socket. Found nodes stay listed after a scan ends.
  let devices: DiscoveredDevice[] = [];
  let scanning = false;
  let degraded = false;
  let scanned = false;   // a scan has run at least once (drives the empty message)

  function updateDiscStatus(): void {
    discStatus.classList.toggle('warn', degraded);
    const n = devices.length;
    if (degraded) discStatus.textContent = 'Unavailable — UDP 6454 in use';
    else if (scanning) discStatus.textContent = n ? `Scanning… · ${n} found` : 'Scanning…';
    else discStatus.textContent = scanned ? (n ? `${n} found` : 'No nodes found') : '';
    scanBtn.innerHTML = scanning
      ? '<i class="fa-solid fa-stop"></i> Stop'
      : '<i class="fa-solid fa-magnifying-glass"></i> Scan';
    scanBtn.classList.toggle('on', scanning);
  }

  // The universe a node should be assigned to: an exact universe-id match, else
  // the only universe (trivial case), else null → the row shows a picker.
  function matchUniverse(d: DiscoveredDevice): number | null {
    if (patchRows.some((r) => r.universeId === d.universe)) return d.universe;
    if (patchRows.length === 1) return patchRows[0].universeId;
    return null;
  }

  function assign(universeId: number, ip: string): void {
    void set(universeId, { protocol: 'artnet', host: ip });
  }

  function discRowEl(d: DiscoveredDevice): HTMLElement {
    const match = matchUniverse(d);
    const name = d.shortName || d.longName || d.ip;
    const row = node(html`
      <div class="cx-disc-row">
        <div class="cx-disc-id">
          <span class="cx-disc-name">${name}${d.isLumox ? html`<span class="cx-badge">Lumox</span>` : ''}</span>
          <span class="cx-disc-meta"><span class="cx-disc-ip">${d.ip}</span> · U${d.universe}${d.firmware ? ` · v${d.firmware}` : ''}</span>
        </div>
        ${match !== null
          ? html`<button class="cx-disc-assign" title="Point that universe's output at this node">Assign → ${uniName(match)}</button>`
          : html`<span class="cx-disc-pick">
              <select class="cx-sel cx-disc-uni">${patchRows.map((r) => html`<option value="${r.universeId}">${r.universeName}</option>`)}</select>
              <button class="cx-disc-assign">Assign</button>
            </span>`}
      </div>`);
    const btn = row.querySelector('.cx-disc-assign') as HTMLButtonElement;
    if (match !== null) {
      btn.addEventListener('click', () => assign(match, d.ip));
    } else {
      const sel = row.querySelector('.cx-disc-uni') as HTMLSelectElement;
      btn.disabled = patchRows.length === 0;
      btn.addEventListener('click', () => assign(Number(sel.value), d.ip));
    }
    return row;
  }

  const uniName = (uid: number): string =>
    patchRows.find((r) => r.universeId === uid)?.universeName ?? `U${uid + 1}`;

  // Re-render the device list. Skipped while a discovery control is focused (so a
  // half-made universe pick isn't clobbered) — the next event refreshes it.
  function renderDiscovery(): void {
    updateDiscStatus();
    if (document.activeElement?.closest?.('.cx-disc-rows')) return;
    if (!devices.length) {
      const msg = degraded
        ? 'Another Art-Net application is using UDP port 6454.'
        : scanning ? 'Searching for Art-Net nodes on the network…'
        : scanned ? 'No nodes found — press Scan to try again.'
        : 'Press Scan to search for Art-Net nodes on the network.';
      discEl.replaceChildren(node(html`<div class="cx-disc-empty">${msg}</div>`));
      return;
    }
    discEl.replaceChildren(...devices.map(discRowEl));
  }

  lumox.discovery.onChanged((list) => { devices = list as DiscoveredDevice[]; renderDiscovery(); });

  await rebuild();

  // Manual scan: start the listener, auto-stop after SCAN_MS. Found nodes remain
  // listed after the scan ends so they can still be assigned.
  let scanTimer: ReturnType<typeof setTimeout> | null = null;
  async function startScan(): Promise<void> {
    if (scanning) return;
    scanned = true;
    const status = await lumox.discovery.start().catch(() => 'degraded' as const);
    degraded = status === 'degraded';
    scanning = status === 'running';
    devices = await lumox.discovery.list().catch(() => []);
    if (scanning) scanTimer = setTimeout(() => void stopScan(), SCAN_MS);
    renderDiscovery();
  }
  async function stopScan(): Promise<void> {
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    scanning = false;
    await lumox.discovery.stop().catch(() => {});
    renderDiscovery();
  }
  scanBtn.addEventListener('click', () => { void (scanning ? stopScan() : startScan()); });

  // ---- audio input (capture source for BPM detect + spectrum meter) -----
  // Drag an enumerated input device onto the slot to pick the capture source; the
  // choice is a machine setting (`audioInput`). A live meter confirms signal. The
  // shared `audioEngine` opens the real capture (also used by the 'audio' BPM source).
  const audioDevicesEl = el.querySelector('#cx-audio-devices') as HTMLElement;
  const audioSlot = el.querySelector('#cx-audio-slot') as HTMLElement;
  const audioName = el.querySelector('#cx-audio-name') as HTMLElement;
  const audioClear = el.querySelector('#cx-audio-clear') as HTMLButtonElement;
  const audioBars = el.querySelector('#cx-audio-bars') as HTMLElement;
  const audioBeat = el.querySelector('#cx-audio-beat') as HTMLElement;
  const audioStatus = el.querySelector('#cx-audio-status') as HTMLElement;

  let inputs: MediaDeviceInfo[] = [];
  let chosen: string | null = null;        // current audioInput setting (null = system default)
  let meterUnsub: Unsubscribe | null = null;
  let audioStateUnsub: Unsubscribe | null = null;
  let beatTimer = 0;

  const barEls = Array.from({ length: audioEngine.getBandCount() }, () => {
    const b = document.createElement('span'); audioBars.appendChild(b); return b;
  });

  const deviceLabel = (id: string | null): string =>
    !id ? 'System default' : inputs.find((d) => d.deviceId === id)?.label || 'Selected input';

  function renderSlot(): void {
    audioName.textContent = deviceLabel(chosen);
    audioClear.hidden = !chosen;
  }

  function renderDevices(): void {
    const chip = (id: string | null, label: string): HTMLElement => {
      const active = (chosen ?? '') === (id ?? '');
      const c = node(html`<button class="cx-audio-chip${active ? ' active' : ''}" draggable="true"><i class="fa-solid fa-grip-vertical"></i>${label}</button>`);
      c.addEventListener('dragstart', (e) => { (e as DragEvent).dataTransfer?.setData('text/plain', id ?? ''); c.classList.add('dragging'); });
      c.addEventListener('dragend', () => c.classList.remove('dragging'));
      c.addEventListener('dblclick', () => choose(id));   // keyboard/no-drag fallback
      return c;
    };
    audioDevicesEl.replaceChildren(
      chip(null, 'System default'),
      ...inputs.map((d) => chip(d.deviceId, d.label || 'Input')),
    );
  }

  function choose(id: string | null): void {
    chosen = id || null;
    audioEngine.setDevice(chosen);
    renderSlot(); renderDevices();
    void lumox.settings.update({ audioInput: chosen }).catch(() => {});
  }

  async function enumerate(): Promise<void> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      inputs = all.filter((d) => d.kind === 'audioinput');
    } catch { inputs = []; }
    renderDevices(); renderSlot();
  }

  audioSlot.addEventListener('dragover', (e) => { e.preventDefault(); audioSlot.classList.add('drop'); });
  audioSlot.addEventListener('dragleave', () => audioSlot.classList.remove('drop'));
  audioSlot.addEventListener('drop', (e) => {
    e.preventDefault(); audioSlot.classList.remove('drop');
    const id = (e as DragEvent).dataTransfer?.getData('text/plain') ?? '';
    choose(id || null);
  });
  audioClear.addEventListener('click', () => choose(null));

  function paintMeter(f: SpectrumFrame): void {
    for (let i = 0; i < barEls.length; i++) barEls[i].style.height = `${Math.round((f.bands[i] ?? 0) * 100)}%`;
    if (f.beat) {
      audioBeat.classList.add('hit');
      clearTimeout(beatTimer);
      beatTimer = window.setTimeout(() => audioBeat.classList.remove('hit'), 110);
    }
  }
  function setAudioStatus(s: 'idle' | 'running' | 'denied'): void {
    audioStatus.classList.toggle('warn', s === 'denied');
    audioStatus.textContent = s === 'denied' ? 'Input blocked — allow microphone access'
      : s === 'running' ? 'Listening' : '';
  }

  function startMeter(): void {
    if (!meterUnsub) meterUnsub = audioEngine.onSpectrum(paintMeter);
    if (!audioStateUnsub) audioStateUnsub = audioEngine.onState((s) => {
      setAudioStatus(s);
      if (s === 'running') void enumerate();   // labels populate once permission is granted
    });
  }
  function stopMeter(): void {
    meterUnsub?.(); meterUnsub = null;
    audioStateUnsub?.(); audioStateUnsub = null;
    audioBeat.classList.remove('hit');
    for (const b of barEls) b.style.height = '0%';
  }

  lumox.settings.get()
    .then((s) => { chosen = s.audioInput; audioEngine.setDevice(chosen); renderSlot(); renderDevices(); })
    .catch(() => {});
  void enumerate();
  navigator.mediaDevices.addEventListener?.('devicechange', () => void enumerate());

  // ---- reactive bindings (audio source → engine target) ----------------
  // Each row maps a band / volume / beat to a Lumox target; the engine applies them
  // live (main/services/AudioBindingService.ts). Targets come from the show (master,
  // blackout, groups, scenes) plus a raw DMX channel built from the universe + channel
  // inputs. Edits go straight to main; the refreshed list re-renders the table.
  const bindsEl = el.querySelector('#cx-audio-binds') as HTMLElement;
  const addBindBtn = el.querySelector('#cx-audio-add') as HTMLButtonElement;
  let targets: AudioTarget[] = [];
  let binds: AudioBinding[] = [];

  const srcValue = (s: AudioSource): string => (s.type === 'band' ? `band:${s.index ?? 0}` : s.type);
  const parseSrc = (v: string): AudioSource =>
    v.startsWith('band:') ? { type: 'band', index: Number(v.slice(5)) } : { type: v as 'volume' | 'beat' };
  const dmxTarget = (u: number, ch: number): AudioTarget =>
    ({ key: `dmx:${u}:${ch}`, label: `DMX ${u + 1}.${ch}`, kind: 'range', min: 0, max: 255 });

  function sourceOpts(sel: string): string {
    const opts = [
      ...Array.from({ length: audioEngine.getBandCount() }, (_, i) => ({ v: `band:${i}`, l: `Band ${i + 1}` })),
      { v: 'volume', l: 'Volume' }, { v: 'beat', l: 'Beat' },
    ];
    return opts.map((o) => `<option value="${o.v}"${o.v === sel ? ' selected' : ''}>${o.l}</option>`).join('');
  }
  function targetOpts(b: AudioBinding): string {
    const isDmx = b.target.key.startsWith('dmx:');
    const cur = isDmx ? 'dmx' : b.target.key;
    const opts = targets.map((t) => `<option value="${t.key}"${t.key === cur ? ' selected' : ''}>${t.label}</option>`);
    opts.push(`<option value="dmx"${isDmx ? ' selected' : ''}>DMX channel…</option>`);
    return opts.join('');
  }

  function bindRow(b: AudioBinding): HTMLElement {
    const isDmx = b.target.key.startsWith('dmx:');
    const [du, dch] = isDmx ? b.target.key.slice(4).split(':').map(Number) : [0, 1];
    const isTrigger = b.target.kind === 'trigger';
    const fine = b.target.max === 1;   // master is 0..1; groups/DMX are 0..255
    const o = b.options;
    const row = node(html`
      <div class="cx-bind" data-id="${b.id}">
        <select class="cx-sel cx-bind-src">${raw(sourceOpts(srcValue(b.source)))}</select>
        <span class="cx-bind-arrow">→</span>
        <select class="cx-sel cx-bind-tgt">${raw(targetOpts(b))}</select>
        ${isDmx ? html`<span class="cx-bind-dmx">
          <input class="cx-bind-u" type="number" min="1" value="${du + 1}" title="Universe" />
          <input class="cx-bind-ch" type="number" min="1" max="512" value="${dch}" title="Channel" />
        </span>` : ''}
        <span class="cx-bind-opts">${isTrigger
          ? html`${b.source.type !== 'beat'
              ? html`<label class="cx-bind-f">Thr<input class="cx-bind-thr" type="number" min="0" max="1" step="0.05" value="${o.threshold ?? 0.5}" /></label>`
              : ''}
            <select class="cx-sel cx-bind-mode">
              <option value="flash"${o.mode !== 'toggle' ? ' selected' : ''}>Flash</option>
              <option value="toggle"${o.mode === 'toggle' ? ' selected' : ''}>Toggle</option>
            </select>`
          : html`<label class="cx-bind-f">Min<input class="cx-bind-min" type="number" step="${fine ? 0.01 : 1}" value="${o.min ?? b.target.min ?? 0}" /></label>
            <label class="cx-bind-f">Max<input class="cx-bind-max" type="number" step="${fine ? 0.01 : 1}" value="${o.max ?? b.target.max ?? 1}" /></label>
            <select class="cx-sel cx-bind-curve">
              <option value="linear"${!o.curve || o.curve === 'linear' ? ' selected' : ''}>Linear</option>
              <option value="exp"${o.curve === 'exp' ? ' selected' : ''}>Exp</option>
              <option value="log"${o.curve === 'log' ? ' selected' : ''}>Log</option>
            </select>
            <label class="cx-bind-f cx-bind-inv"><input class="cx-bind-invert" type="checkbox"${o.invert ? ' checked' : ''} />Inv</label>`}
        </span>
        <button class="cx-bind-del" title="Remove binding">&times;</button>
      </div>`);

    const id = b.id;
    const q = <T extends HTMLElement>(sel: string) => row.querySelector(sel) as T;
    const setOpts = (patch: Record<string, unknown>) => void lumox.audio.setBindingOptions(id, patch).catch(() => {});
    const readDmx = (): AudioTarget => dmxTarget(
      Math.max(0, (Number(q<HTMLInputElement>('.cx-bind-u')?.value) || 1) - 1),
      Math.min(512, Math.max(1, Number(q<HTMLInputElement>('.cx-bind-ch')?.value) || 1)),
    );

    q<HTMLSelectElement>('.cx-bind-src').addEventListener('change', (e) =>
      void lumox.audio.setBinding(id, { source: parseSrc((e.target as HTMLSelectElement).value) }).catch(() => {}));
    q<HTMLSelectElement>('.cx-bind-tgt').addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      const target = v === 'dmx' ? readDmx() : targets.find((t) => t.key === v);
      if (target) void lumox.audio.setBinding(id, { target }).catch(() => {});
    });
    if (isDmx) {
      const reDmx = () => void lumox.audio.setBinding(id, { target: readDmx() }).catch(() => {});
      q<HTMLInputElement>('.cx-bind-u')?.addEventListener('change', reDmx);
      q<HTMLInputElement>('.cx-bind-ch')?.addEventListener('change', reDmx);
    }
    if (isTrigger) {
      q<HTMLInputElement>('.cx-bind-thr')?.addEventListener('change', (e) => setOpts({ threshold: Number((e.target as HTMLInputElement).value) }));
      q<HTMLSelectElement>('.cx-bind-mode').addEventListener('change', (e) => setOpts({ mode: (e.target as HTMLSelectElement).value }));
    } else {
      q<HTMLInputElement>('.cx-bind-min').addEventListener('change', (e) => setOpts({ min: Number((e.target as HTMLInputElement).value) }));
      q<HTMLInputElement>('.cx-bind-max').addEventListener('change', (e) => setOpts({ max: Number((e.target as HTMLInputElement).value) }));
      q<HTMLSelectElement>('.cx-bind-curve').addEventListener('change', (e) => setOpts({ curve: (e.target as HTMLSelectElement).value as AudioCurve }));
      q<HTMLInputElement>('.cx-bind-invert').addEventListener('change', (e) => setOpts({ invert: (e.target as HTMLInputElement).checked }));
    }
    q<HTMLButtonElement>('.cx-bind-del').addEventListener('click', () => void lumox.audio.removeBinding(id).catch(() => {}));
    return row;
  }

  function renderBinds(): void {
    // Don't clobber a number field mid-edit; selects/checkboxes commit on change, so a
    // target-kind switch still re-renders its options immediately.
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && a.type === 'number' && a.closest('.cx-audio-binds')) return;
    if (!binds.length) {
      bindsEl.replaceChildren(node(html`<div class="cx-bind-empty">No bindings — add one to drive a target from the audio.</div>`));
      return;
    }
    bindsEl.replaceChildren(...binds.map(bindRow));
  }

  async function refreshTargets(): Promise<void> {
    try { targets = await lumox.audio.targets(); } catch { targets = []; }
    renderBinds();
  }

  addBindBtn.addEventListener('click', () => {
    const target = targets[0] ?? { key: 'master', label: 'Grand master', kind: 'range', min: 0, max: 1 };
    void lumox.audio.addBinding({ type: 'band', index: 0 }, target).catch(() => {});
  });
  lumox.audio.onBindings((b) => { binds = b as AudioBinding[]; renderBinds(); });
  lumox.audio.listBindings().then((b) => { binds = b; return refreshTargets(); }).catch(() => {});

  // Poll output status only while the tab is visible (IntersectionObserver). Discovery
  // is started manually, but always stopped on hide to free the socket; the audio meter
  // subscribes/releases the shared capture with visibility too.
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const io = new IntersectionObserver((entries) => {
    const visible = entries.some((en) => en.isIntersecting);
    if (visible) {
      void pollStatus(); if (!pollTimer) pollTimer = setInterval(() => void pollStatus(), POLL_MS);
      startMeter();
      void refreshTargets();   // groups/scenes may have changed while hidden
    } else {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (scanning) void stopScan();
      stopMeter();
    }
  });
  io.observe(el);

  // A project load rebuilds the patch — refresh the table when one lands.
  lumox.project.onLoaded(() => { void rebuild(); });

  return el;
}
