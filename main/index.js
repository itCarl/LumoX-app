// Electron main — placeholder. UI not built yet; engine boots headless-style
// and exposes itself for future IPC. Keep this thin.

import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  Engine, OutputManager, setLogLevel,
  Show, Fixture, Group, Scene, ChannelTypeRegistry,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
setLogLevel('info');

const engine = new Engine({ refreshHz: 44 });
const show = new Show({ name: 'Untitled' });

// Banks — ordered containers of scenes (CONTROL view). Kept here (not yet in
// the engine Show model). Each: { id, name, sceneIds: [] }.
const banks = [];
let bankSeq = 0;
function ensureDefaultBank() { if (!banks.length) addBank('Bank 1'); }
function addBank(name) {
  const b = { id: `bank_${++bankSeq}`, name: name || `Bank ${banks.length + 1}`, sceneIds: [] };
  banks.push(b);
  return b;
}

// Hold reference globally so renderer-side dev tools can poke at it later.
globalThis.lumox = { engine, show };

// Load the built-in fixture library, then ensure a default universe so the
// PATCH view has something to draw on first launch.
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');
async function bootShow() {
  try {
    const r = await show.library.loadFromDirectory(FIXTURES_DIR, { source: 'builtin' });
    console.log(`[show] library: ${r.loaded} loaded, ${r.skipped} skipped, ${r.errors.length} errors`);
  } catch (err) {
    console.error('[show] library load failed:', err.message);
  }
  // Make 10 universes available by default (no manual add in the UI).
  for (let i = 0; i < 10; i++) engine.universes.ensure(i, `Universe ${i + 1}`);
  ensureDefaultBank();
}

// ---- serializers (engine objects → plain JSON for the renderer) --------
function defJSON(def) {
  return {
    id: def.id,
    manufacturer: def.manufacturer,
    model: def.model,
    type: def.type,
    emitters: def.emitters ?? 1,
    source: def.source ?? 'builtin',
    modes: def.modes.map((m) => ({ id: m.id, name: m.name, channelCount: m.channelCount })),
  };
}

// Channel-config identity — fixtures with the same definition + mode share a
// layout and may be grouped together; different configs may not.
const configKey = (fx) => `${fx.definition.id}::${fx.mode.id}`;

// Group palette — each group gets a distinct colour; its fixtures inherit it.
const GROUP_COLORS = [
  '#e0564b', '#e08a3b', '#e0c44b', '#8ec44b', '#4bc49a',
  '#4ba6e0', '#6b7ce0', '#9c5be0', '#e04bb0', '#5bd0e0',
];
let colorCursor = 0;
const nextColor = () => GROUP_COLORS[colorCursor++ % GROUP_COLORS.length];

function fixtureJSON(fx) {
  const group = show.groups.containing(fx.id)[0] ?? null;
  return {
    id: fx.id,
    name: fx.name,
    color: group?.color ?? '#6b6b6b',     // colour comes from the group
    definitionId: fx.definition.id,
    model: fx.definition.model,
    type: fx.definition.type,
    emitters: fx.definition.emitters ?? 1,
    modeId: fx.mode.id,
    modeName: fx.mode.name,
    configKey: configKey(fx),
    groupId: group?.id ?? null,
    groupName: group?.name ?? null,
    universeId: fx.universeId,
    startAddress: fx.startAddress,
    endAddress: fx.endAddress,
    channelCount: fx.channelCount,
    channels: fx.mode.channels.map((c, i) => ({
      index: i + 1,
      name: c?.name ?? '—',
      typeId: c?.typeId ?? null,
      group: c?.type?.group ?? null,
      color: c?.type?.color ?? null,
    })),
  };
}

// All fixture ids share one channel-config? (membership constraint)
function sameConfig(ids) {
  const keys = new Set();
  for (const id of ids) {
    const f = show.patch.get(id);
    if (f) keys.add(configKey(f));
  }
  return keys.size <= 1;
}

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    frame: false,                 // custom titlebar (renderer draws the chrome)
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.maximize();   // always start full screen
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Tell the renderer when maximize state flips so it can swap the icon.
  const sendMax = () => win.webContents.send('win:maximized', win.isMaximized());
  win.on('maximize', sendMax);
  win.on('unmaximize', sendMax);
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
}

// ---- fixture editor window (separate, movable) -------------------------
let editorWindow = null;
function openEditorWindow() {
  if (editorWindow && !editorWindow.isDestroyed()) { editorWindow.focus(); return; }
  editorWindow = new BrowserWindow({
    width: 600, height: 660,
    minWidth: 460, minHeight: 420,
    parent: mainWindow ?? undefined,
    frame: false,
    backgroundColor: '#232323',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  editorWindow.loadFile(path.join(__dirname, '..', 'renderer', 'fixtureeditor.html'));
  editorWindow.on('closed', () => { editorWindow = null; });
}
ipcMain.handle('lumox:editor:open', () => openEditorWindow());

// Close whichever window made the call (used by frameless child windows).
ipcMain.handle('lumox:win:closeSelf', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});

// ---- window controls (custom frameless titlebar) -----------------------
ipcMain.handle('lumox:win:minimize', () => mainWindow?.minimize());
ipcMain.handle('lumox:win:maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('lumox:win:close', () => mainWindow?.close());
ipcMain.handle('lumox:win:isMaximized', () => mainWindow?.isMaximized() ?? false);

// ---- minimal IPC surface — fleshed out when UI lands -------------------
ipcMain.handle('lumox:outputs:list', () =>
  engine.outputs.list().map((o) => ({
    id: o.id, name: o.name, type: o.type, enabled: o.enabled, isOpen: o.isOpen,
    subscribedUniverses: [...o.subscribedUniverses],
  })),
);

ipcMain.handle('lumox:outputs:create', async (_e, { type, config }) => {
  const out = engine.outputs.create(type, config);
  await out.open();
  return out.id;
});

ipcMain.handle('lumox:outputs:remove', (_e, id) => {
  engine.outputs.remove(id);
});

ipcMain.handle('lumox:outputs:available', () => OutputManager.availableTypes());

ipcMain.handle('lumox:universes:list', () =>
  engine.universes.list().map((u) => ({ id: u.id, name: u.name })),
);

ipcMain.handle('lumox:universes:ensure', (_e, { id, name }) => {
  engine.universes.ensure(id, name);
});

ipcMain.handle('lumox:universes:setChannel', (_e, { id, channel, value }) => {
  engine.universes.get(id)?.setChannel(channel, value);
});

ipcMain.handle('lumox:engine:start', () => engine.start());
ipcMain.handle('lumox:engine:stop',  () => engine.stop());

ipcMain.handle('lumox:engine:status', () => ({
  running: engine._running,
  frame: engine._frame,
  refreshHz: engine.refreshHz,
}));

// ---- mix controls ------------------------------------------------------
ipcMain.handle('lumox:master:set', (_e, value) => {
  engine.grandMaster.setValue(value);
});

ipcMain.handle('lumox:blackout:set', (_e, active) => {
  engine.blackout.set(active);
});

// Live mixed output (post-pipeline) for meters.
ipcMain.handle('lumox:universes:read', (_e, id) =>
  Array.from(engine.universes.get(id)?.data ?? []),
);

// ---- fixture library ---------------------------------------------------
ipcMain.handle('lumox:library:list', () =>
  show.library.list().filter((d) => d.manufacturer && d.model).map(defJSON));

// Channel types for the fixture editor's per-channel dropdown.
ipcMain.handle('lumox:library:channelTypes', () =>
  ChannelTypeRegistry.all()
    .map((t) => ({ id: t.id, name: t.name, group: t.group }))
    .sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name)));

// Add a user-authored fixture definition. `def` = plain JSON
// { manufacturer, model, type, modes:[{ name, channels:[{ name, typeId }] }] }.
ipcMain.handle('lumox:library:add', (_e, def) => {
  if (!def?.manufacturer?.trim() || !def?.model?.trim()) {
    throw new Error('Manufacturer and model are required');
  }
  if (!def.modes?.length || !def.modes.some((m) => m.channels?.length)) {
    throw new Error('At least one mode with one channel is required');
  }
  const added = show.library.add(def, 'user');   // FixtureDefinition.fromJSON validates typeIds
  mainWindow?.webContents.send('library:changed');  // refresh the main window's library tile
  return defJSON(added);
});

// ---- patch -------------------------------------------------------------
ipcMain.handle('lumox:patch:list', () => show.patch.list().map(fixtureJSON));

// Add `count` fixtures of a definition/mode, packing them consecutively from
// `startAddress`. Returns the created fixtures (serialized).
ipcMain.handle('lumox:patch:add', (_e, { definitionId, modeId, universeId, startAddress, count = 1, name, index = 1 }) => {
  const def = show.library.get(definitionId);
  if (!def) throw new Error(`Unknown fixture definition: ${definitionId}`);
  const mode = modeId ? def.mode(modeId) : def.defaultMode;
  if (!mode) throw new Error(`Definition ${definitionId} has no mode ${modeId}`);

  engine.universes.ensure(universeId, `Universe ${universeId + 1}`);

  // Overlap / bounds guard — reject if any requested slot is out of the
  // 1..512 range or already occupied on this universe.
  const span = mode.channelCount;
  const occupied = new Uint8Array(513); // 1-based
  for (const f of show.patch.forUniverse(universeId)) {
    for (let a = f.startAddress; a <= f.endAddress && a <= 512; a++) occupied[a] = 1;
  }
  const total = span * count;
  if (startAddress < 1 || startAddress + total - 1 > 512) {
    throw new Error(`Out of range: ${count}×${span}ch from ${startAddress} exceeds channel 512`);
  }
  for (let a = startAddress; a < startAddress + total; a++) {
    if (occupied[a]) throw new Error(`Address ${a} already patched on universe ${universeId + 1}`);
  }

  const created = [];
  let addr = startAddress;
  for (let i = 0; i < count; i++) {
    const base = name ?? def.model;
    const fx = new Fixture({
      name: count > 1 ? `${base} ${index + i}` : base,
      definition: def, mode,
      universeId, startAddress: addr,
    });
    show.patch.add(fx);
    created.push(fx);
    addr += mode.channelCount;
  }

  // Each patch operation gets its own group (single or bulk). Identical
  // config alone does NOT auto-join an existing group.
  if (created.length) {
    const g = show.groups.add(new Group({
      name: `${def.model}`,
      color: nextColor(),
      fixtureIds: created.map((fx) => fx.id),
    }));
    g.configKey = configKey(created[0]);
  }

  return created.map(fixtureJSON);
});

// Move a patched fixture to a new start address (drag within the grid).
ipcMain.handle('lumox:patch:move', (_e, { id, universeId, startAddress }) => {
  const fx = show.patch.get(id);
  if (!fx) throw new Error('Unknown fixture');
  const uni = universeId ?? fx.universeId;
  const span = fx.channelCount;
  if (startAddress < 1 || startAddress + span - 1 > 512) {
    throw new Error(`Out of range: ${span}ch from ${startAddress} exceeds channel 512`);
  }
  const occupied = new Uint8Array(513);
  for (const o of show.patch.forUniverse(uni)) {
    if (o.id === id) continue;                  // ignore self
    for (let a = o.startAddress; a <= o.endAddress && a <= 512; a++) occupied[a] = 1;
  }
  for (let a = startAddress; a < startAddress + span; a++) {
    if (occupied[a]) throw new Error(`Address ${a} already patched on universe ${uni + 1}`);
  }
  // clear old output, move, re-apply
  const oldUni = engine.universes.get(fx.universeId);
  if (oldUni) for (let a = fx.startAddress; a <= fx.endAddress; a++) oldUni.setChannel(a, 0);
  fx.universeId = uni;
  fx.startAddress = startAddress;
  engine.universes.ensure(uni, `Universe ${uni + 1}`);
  fx.apply(engine.universes.get(uni));
  return fixtureJSON(fx);
});

ipcMain.handle('lumox:patch:remove', (_e, id) => {
  show.patch.remove(id);
  show.groups.purgeFixture(id);
  // drop now-empty auto-groups
  for (const g of show.groups.list()) if (g.size === 0) show.groups.remove(g.id);
});

ipcMain.handle('lumox:patch:rename', (_e, { id, name }) => {
  const fx = show.patch.get(id);
  if (fx) fx.name = name;
});

ipcMain.handle('lumox:patch:overlaps', () => show.patch.detectOverlaps());

// ---- groups ------------------------------------------------------------
function groupJSON(g) {
  return { id: g.id, name: g.name, color: g.color, configKey: g.configKey ?? null, fixtureIds: g.list() };
}
ipcMain.handle('lumox:groups:list', () => show.groups.list().map(groupJSON));

ipcMain.handle('lumox:groups:add', (_e, { name, color, fixtureIds = [] } = {}) => {
  if (!sameConfig(fixtureIds)) {
    throw new Error('A group may only contain fixtures with the same channel configuration');
  }
  const n = show.groups.list().length + 1;
  const g = show.groups.add(new Group({
    name: name || `Group ${n}`,
    color: color || nextColor(),
    fixtureIds,
  }));
  const first = show.patch.get(fixtureIds[0]);
  if (first) g.configKey = configKey(first);
  return groupJSON(g);
});

ipcMain.handle('lumox:groups:remove', (_e, id) => show.groups.remove(id));

ipcMain.handle('lumox:groups:setFixtures', (_e, { id, fixtureIds }) => {
  const g = show.groups.get(id);
  if (!g) return;
  if (!sameConfig(fixtureIds)) {
    throw new Error('A group may only contain fixtures with the same channel configuration');
  }
  g.clear();
  for (const fid of fixtureIds) g.add(fid);
});

ipcMain.handle('lumox:groups:rename', (_e, { id, name, color }) => {
  const g = show.groups.get(id);
  if (!g) return;
  if (name != null) g.name = name;
  if (color != null) g.color = color;
});

// ---- live channel writes (fader editor) --------------------------------
// Write a fixture-local channel (1-based) into its universe's programmer
// buffer. BaseLayer copies programmer → data each tick, so it sticks.
ipcMain.handle('lumox:fixtures:setChannel', (_e, { fixtureId, channel, value }) => {
  const fx = show.patch.get(fixtureId);
  if (!fx) return;
  fx.setChannel(channel, value);
  const u = engine.universes.get(fx.universeId);
  if (u) fx.apply(u);
});

// ---- scenes ------------------------------------------------------------
function sceneJSON(s) {
  const track = engine.scenes.tracks.get(s.id);
  const opacity = track?.opacity ?? 0;
  return { id: s.id, name: s.name, opacity, active: opacity > 0 };
}
ipcMain.handle('lumox:scenes:list', () => show.listScenes().map(sceneJSON));

ipcMain.handle('lumox:scenes:capture', (_e, { name, bankId } = {}) => {
  const universes = engine.universes.list();
  const s = Scene.snapshot({ name: name || 'New Scene', universes });
  show.addScene(s);
  engine.scenes.addTrack(s.toMixerTrack({ blend: 'htp', opacity: 0 }));
  const bank = banks.find((b) => b.id === bankId) ?? banks[0];
  if (bank) bank.sceneIds.push(s.id);
  return sceneJSON(s);
});

ipcMain.handle('lumox:scenes:recall', (_e, { id, on }) => {
  engine.scenes.setOpacity(id, on ? 1 : 0);
});

ipcMain.handle('lumox:scenes:remove', (_e, id) => {
  engine.scenes.removeTrack(id);
  show.removeScene(id);
  for (const b of banks) b.sceneIds = b.sceneIds.filter((sid) => sid !== id);
});

ipcMain.handle('lumox:scenes:rename', (_e, { id, name }) => {
  const s = show.scenes.get(id);
  if (s) s.name = name;
});

// ---- banks (CONTROL view) ---------------------------------------------
function bankJSON(b) {
  return {
    id: b.id,
    name: b.name,
    scenes: b.sceneIds.map((id) => show.scenes.get(id)).filter(Boolean).map(sceneJSON),
  };
}
ipcMain.handle('lumox:banks:list', () => banks.map(bankJSON));
ipcMain.handle('lumox:banks:add', (_e, { name } = {}) => bankJSON(addBank(name)));
ipcMain.handle('lumox:banks:rename', (_e, { id, name }) => {
  const b = banks.find((x) => x.id === id);
  if (b && name) b.name = name;
});
ipcMain.handle('lumox:banks:remove', (_e, id) => {
  const i = banks.findIndex((b) => b.id === id);
  if (i < 0) return;
  for (const sid of banks[i].sceneIds) { engine.scenes.removeTrack(sid); show.removeScene(sid); }
  banks.splice(i, 1);
  ensureDefaultBank();
});

// ---- app lifecycle -----------------------------------------------------
app.whenReady().then(async () => {
  await bootShow();
  engine.start();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Idempotent teardown — stop the tick loop, then close every output socket
// (Art-Net / sACN). Guarded so the multiple shutdown paths below run it once.
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    engine.stop();
    await engine.outputs.closeAll();
    console.log('[shutdown] outputs closed');
  } catch (err) {
    console.error('[shutdown] error:', err.message);
  }
}

// Closing the last window quits (except macOS, where apps stay resident).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Canonical quit path (window close, menu Quit, Cmd+Q, app.quit()). Hold the
// quit until outputs are closed, then let it proceed.
app.on('before-quit', (e) => {
  if (shuttingDown) return;     // second pass — allow quit to complete
  e.preventDefault();
  shutdown().finally(() => app.quit());
});

// Dev / signal kills (Ctrl-C from `npm start`, OS terminate).
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => shutdown().finally(() => process.exit(0)));
}
