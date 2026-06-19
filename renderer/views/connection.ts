// Connection view — the DMX output patch (a dedicated I/O page, like a pro
// lighting console). One row per engine universe: protocol (Art-Net / sACN),
// target IP, frame mode (standard / full / partial), rate cap, and on/off, with a
// live transmit indicator. The patch is stored PER PROJECT; edits go through
// `lumox.outputs.setUniverse`. Status is polled while the tab is on screen.

import { html, node } from '../lib/dom';
import type { UniverseOutputRow, DmxProtocol, FrameMode, DiscoveredDevice } from '../lumox.d';

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
      <span class="cx-title">CONNECTION — DMX OUTPUT</span>
      <span class="cx-status-pill" id="cx-pill"><span class="cx-dot"></span><span id="cx-pill-text">…</span></span>
    </div>
    <div class="cx-body">
      <div class="cx-patch">
        <div class="cx-patch-head">
          <span>Universe</span><span>Protocol</span><span>Target IP</span><span>Frame mode</span><span>Rate</span><span>On</span><span>Status</span>
        </div>
        <div class="cx-rows" id="cx-patch"></div>
        <button class="cx-add" id="cx-add"><i class="fa-solid fa-plus"></i> Add universe</button>
      </div>
      <div class="cx-discovery">
        <div class="cx-disc-head">
          <span class="cx-title">DISCOVERED NODES</span>
          <span class="cx-disc-status" id="cx-disc-status"></span>
          <button class="cx-disc-scan" id="cx-disc-scan"><i class="fa-solid fa-magnifying-glass"></i> Scan</button>
        </div>
        <div class="cx-disc-rows" id="cx-disc"></div>
      </div>
      <div class="cx-note">
        One output per universe — saved with the project. <b>Art-Net</b> targets a
        node IP (unicast) or <code>255.255.255.255</code> (broadcast); <b>sACN</b> is
        multicast. <b>Frame mode:</b> Standard sends on change + keep-alive (lowest
        traffic); Full streams all 512 channels continuously; Partial streams only
        the used channels. <b>Discovery</b> finds Art-Net nodes (sACN has no node
        discovery) — Assign points a universe's output at the node's IP.
      </div>
    </div>`;

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
        <span class="cx-disc-name">${name}${d.isLumox ? html`<span class="cx-badge">Lumox</span>` : ''}</span>
        <span class="cx-disc-ip">${d.ip}</span>
        <span class="cx-disc-meta">U${d.universe}${d.firmware ? ` · v${d.firmware}` : ''}</span>
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

  // Poll output status only while the tab is visible (IntersectionObserver).
  // Discovery is started manually, but always stopped on hide to free the socket.
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const io = new IntersectionObserver((entries) => {
    const visible = entries.some((en) => en.isIntersecting);
    if (visible) {
      void pollStatus(); if (!pollTimer) pollTimer = setInterval(() => void pollStatus(), POLL_MS);
    } else {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (scanning) void stopScan();
    }
  });
  io.observe(el);

  // A project load rebuilds the patch — refresh the table when one lands.
  lumox.project.onLoaded(() => { void rebuild(); });

  return el;
}
