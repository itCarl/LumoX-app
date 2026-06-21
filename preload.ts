// Preload — exposes `window.lumox.*` to the renderer with no Node access.
// Mirrors handlers in main/index.ts. Extend as UI grows.
// Bundled by esbuild to dist/preload.cjs (CommonJS — Electron preload req.).

import { contextBridge, ipcRenderer } from 'electron';

type Cb<T = void> = (value: T) => void;

contextBridge.exposeInMainWorld('lumox', {
  outputs: {
    list:           ()       => ipcRenderer.invoke('lumox:outputs:list'),
    available:      ()       => ipcRenderer.invoke('lumox:outputs:available'),
    patch:          ()       => ipcRenderer.invoke('lumox:outputs:patch'),
    setUniverse:    (cfg: unknown) => ipcRenderer.invoke('lumox:outputs:setUniverse', cfg),
    removeUniverse: (universeId: number) => ipcRenderer.invoke('lumox:outputs:removeUniverse', { universeId }),
  },
  discovery: {
    start:     () => ipcRenderer.invoke('lumox:discovery:start'),
    stop:      () => ipcRenderer.invoke('lumox:discovery:stop'),
    list:      () => ipcRenderer.invoke('lumox:discovery:list'),
    onChanged: (cb: Cb<unknown[]>) => ipcRenderer.on('discovery:changed', (_e, d) => cb(d)),
  },
  universes: {
    list:       ()      => ipcRenderer.invoke('lumox:universes:list'),
    ensure:     (id: number, name?: string) => ipcRenderer.invoke('lumox:universes:ensure', { id, name }),
    setChannel: (id: number, channel: number, value: number) =>
      ipcRenderer.invoke('lumox:universes:setChannel', { id, channel, value }),
    read:       (id: number)    => ipcRenderer.invoke('lumox:universes:read', id),
  },
  master: {
    set: (value: number) => ipcRenderer.invoke('lumox:master:set', value),
  },
  blackout: {
    set: (active: boolean) => ipcRenderer.invoke('lumox:blackout:set', active),
  },
  engine: {
    start:  () => ipcRenderer.invoke('lumox:engine:start'),
    stop:   () => ipcRenderer.invoke('lumox:engine:stop'),
    status: () => ipcRenderer.invoke('lumox:engine:status'),
  },
  library: {
    vendors:      () => ipcRenderer.invoke('lumox:library:vendors'),
    vendor:       (name: string) => ipcRenderer.invoke('lumox:library:vendor', name),
    list:         () => ipcRenderer.invoke('lumox:library:list'),
    channelTypes: () => ipcRenderer.invoke('lumox:library:channelTypes'),
    add:          (def: unknown, replaceId?: string) => ipcRenderer.invoke('lumox:library:add', def, replaceId),
    remove:       (id: string) => ipcRenderer.invoke('lumox:library:remove', id),
    onChanged:    (cb: Cb) => ipcRenderer.on('library:changed', () => cb()),
  },
  editor: {
    open:   (defId?: string) => ipcRenderer.invoke('lumox:editor:open', defId),
    target: () => ipcRenderer.invoke('lumox:editor:target'),
  },
  project: {
    new:      () => ipcRenderer.invoke('lumox:project:new'),
    save:     () => ipcRenderer.invoke('lumox:project:save'),
    saveAs:   () => ipcRenderer.invoke('lumox:project:saveAs'),
    open:     () => ipcRenderer.invoke('lumox:project:open'),
    info:     () => ipcRenderer.invoke('lumox:project:info'),
    report:   () => ipcRenderer.invoke('lumox:project:report'),
    onLoaded: (cb: Cb) => ipcRenderer.on('project:loaded', () => cb()),
    onChanged: (cb: Cb<{ name: string; path: string | null; dirty: boolean }>) =>
      ipcRenderer.on('project:changed', (_e, info) => cb(info)),
  },
  // Generic dialog window (replaces in-app modals). `open` is used by views to
  // pop a notice/confirmation and await the chosen button id; `spec`/`resolve`
  // are the dialog page's own round-trip.
  dialog: {
    open:    (spec: unknown) => ipcRenderer.invoke('lumox:dialog:open', spec),
    spec:    () => ipcRenderer.invoke('lumox:dialog:spec'),
    resolve: (id: string) => ipcRenderer.invoke('lumox:dialog:resolve', id),
  },
  // Generic panel window (Settings, group order): `open` pops the window; `spec`
  // is the panel page's own fetch of what to render.
  panel: {
    open: (spec: unknown) => ipcRenderer.invoke('lumox:panel:open', spec),
    spec: () => ipcRenderer.invoke('lumox:panel:spec'),
  },
  history: {
    undo:  () => ipcRenderer.invoke('lumox:history:undo'),
    redo:  () => ipcRenderer.invoke('lumox:history:redo'),
    state: () => ipcRenderer.invoke('lumox:history:state'),
  },
  patch: {
    list:     ()   => ipcRenderer.invoke('lumox:patch:list'),
    add:      (opts: unknown) => ipcRenderer.invoke('lumox:patch:add', opts),
    move:     (opts: unknown) => ipcRenderer.invoke('lumox:patch:move', opts),
    remove:   (id: string) => ipcRenderer.invoke('lumox:patch:remove', id),
    rename:   (id: string, name: string) => ipcRenderer.invoke('lumox:patch:rename', { id, name }),
    setTransform: (id: string, transform: unknown) => ipcRenderer.invoke('lumox:patch:setTransform', { id, transform }),
    placeInitial: (id: string, transform: unknown) => ipcRenderer.invoke('lumox:patch:placeInitial', { id, transform }),
    overlaps: ()   => ipcRenderer.invoke('lumox:patch:overlaps'),
  },
  groups: {
    list:        ()   => ipcRenderer.invoke('lumox:groups:list'),
    add:         (opts: unknown) => ipcRenderer.invoke('lumox:groups:add', opts),
    remove:      (id: string) => ipcRenderer.invoke('lumox:groups:remove', id),
    setFixtures: (id: string, fixtureIds: string[]) => ipcRenderer.invoke('lumox:groups:setFixtures', { id, fixtureIds }),
    rename:      (id: string, name?: string, color?: string) => ipcRenderer.invoke('lumox:groups:rename', { id, name, color }),
  },
  selection: {
    get:      ()                 => ipcRenderer.invoke('lumox:selection:get'),
    set:      (ids: string[])    => ipcRenderer.invoke('lumox:selection:set', { ids }),
    add:      (ids: string[])    => ipcRenderer.invoke('lumox:selection:add', { ids }),
    remove:   (ids: string[])    => ipcRenderer.invoke('lumox:selection:remove', { ids }),
    clear:    ()                 => ipcRenderer.invoke('lumox:selection:clear'),
    all:      ()                 => ipcRenderer.invoke('lumox:selection:all'),
    invert:   ()                 => ipcRenderer.invoke('lumox:selection:invert'),
    reorder:  (from: number, to: number) => ipcRenderer.invoke('lumox:selection:reorder', { from, to }),
    onChanged: (cb: Cb<string[]>) => ipcRenderer.on('selection:changed', (_e, ids) => cb(ids)),
  },
  // Saved (named, ordered, recallable) selections — persisted in the show.
  selections: {
    list:        ()   => ipcRenderer.invoke('lumox:selections:list'),
    save:        (fixtureIds: string[], name?: string) => ipcRenderer.invoke('lumox:selections:save', { fixtureIds, name }),
    rename:      (id: string, name: string) => ipcRenderer.invoke('lumox:selections:rename', { id, name }),
    remove:      (id: string) => ipcRenderer.invoke('lumox:selections:remove', id),
    setFixtures: (id: string, fixtureIds: string[]) => ipcRenderer.invoke('lumox:selections:setFixtures', { id, fixtureIds }),
    recall:      (id: string) => ipcRenderer.invoke('lumox:selections:recall', id),
  },
  fixtures: {
    setChannel: (fixtureId: string, channel: number, value: number, absChannel?: number) =>
      ipcRenderer.invoke('lumox:fixtures:setChannel', { fixtureId, channel, value, absChannel }),
    releaseChannel: (fixtureId: string, channel: number, absChannel?: number) =>
      ipcRenderer.invoke('lumox:fixtures:releaseChannel', { fixtureId, channel, absChannel }),
    clearProgrammer: () => ipcRenderer.invoke('lumox:fixtures:clearProgrammer'),
    programmer:      () => ipcRenderer.invoke('lumox:fixtures:programmer'),
    setLimits:   (fixtureIds: string[], patch: unknown) => ipcRenderer.invoke('lumox:fixtures:setLimits', { fixtureIds, patch }),
    clearLimits: (fixtureIds: string[]) => ipcRenderer.invoke('lumox:fixtures:clearLimits', { fixtureIds }),
  },
  scenes: {
    list:    ()   => ipcRenderer.invoke('lumox:scenes:list'),
    values:  (id: string) => ipcRenderer.invoke('lumox:scenes:values', id),
    capture: (bankId?: string, name?: string) => ipcRenderer.invoke('lumox:scenes:capture', { bankId, name }),
    recall:  (id: string, on: boolean) => ipcRenderer.invoke('lumox:scenes:recall', { id, on }),
    remove:  (id: string) => ipcRenderer.invoke('lumox:scenes:remove', id),
    rename:  (id: string, name: string) => ipcRenderer.invoke('lumox:scenes:rename', { id, name }),
    update:  (id: string) => ipcRenderer.invoke('lumox:scenes:update', id),
    merge:   (id: string) => ipcRenderer.invoke('lumox:scenes:merge', id),
    setColor: (id: string, color: string) => ipcRenderer.invoke('lumox:scenes:setColor', { id, color }),
    setChannel: (id: string, fixtureId: string, channel: number, value: number | null, absChannel?: number) =>
      ipcRenderer.invoke('lumox:scenes:setChannel', { id, fixtureId, channel, value, absChannel }),
    setType: (id: string, type: string) => ipcRenderer.invoke('lumox:scenes:setType', { id, type }),
    setRate: (id: string, rateMs: number) => ipcRenderer.invoke('lumox:scenes:setRate', { id, rateMs }),
    addStep: (id: string) => ipcRenderer.invoke('lumox:scenes:addStep', id),
    removeStep: (id: string, index: number) => ipcRenderer.invoke('lumox:scenes:removeStep', { id, index }),
    moveStep: (id: string, index: number, delta: number) => ipcRenderer.invoke('lumox:scenes:moveStep', { id, index, delta }),
    setStepTiming: (id: string, index: number, timing: { fadeMs?: number; waitMs?: number }) =>
      ipcRenderer.invoke('lumox:scenes:setStepTiming', { id, index, ...timing }),
    duplicate: (id: string) => ipcRenderer.invoke('lumox:scenes:duplicate', id),
    // Scene Properties panel
    get:     (id: string) => ipcRenderer.invoke('lumox:scenes:get', id),
    setLevel:  (id: string, level: number) => ipcRenderer.invoke('lumox:scenes:setLevel', { id, level }),
    setSpeed:  (id: string, speed: number) => ipcRenderer.invoke('lumox:scenes:setSpeed', { id, speed }),
    setFade:   (id: string, opts: unknown) => ipcRenderer.invoke('lumox:scenes:setFade', { id, ...(opts as object) }),
    setDrive:  (id: string, opts: unknown) => ipcRenderer.invoke('lumox:scenes:setDrive', { id, ...(opts as object) }),
    setStartMode: (id: string, mode: string) => ipcRenderer.invoke('lumox:scenes:setStartMode', { id, mode }),
    setDirection: (id: string, direction: string) => ipcRenderer.invoke('lumox:scenes:setDirection', { id, direction }),
    // Advanced panel
    setPriority: (id: string, priority: string) => ipcRenderer.invoke('lumox:scenes:setPriority', { id, priority }),
    setLoop: (id: string, opts: unknown) => ipcRenderer.invoke('lumox:scenes:setLoop', { id, ...(opts as object) }),
    setJumpTo: (id: string, jumpTo: unknown) => ipcRenderer.invoke('lumox:scenes:setJumpTo', { id, jumpTo }),
    setReleaseAtEnd: (id: string, on: boolean) => ipcRenderer.invoke('lumox:scenes:setReleaseAtEnd', { id, on }),
    setReleaseMode: (id: string, opts: unknown) => ipcRenderer.invoke('lumox:scenes:setReleaseMode', { id, ...(opts as object) }),
    setProtect: (id: string, opts: unknown) => ipcRenderer.invoke('lumox:scenes:setProtect', { id, ...(opts as object) }),
    setFlash: (id: string, on: boolean) => ipcRenderer.invoke('lumox:scenes:setFlash', { id, on }),
    // FX rack layers
    addLayer:    (id: string, kind: string) => ipcRenderer.invoke('lumox:scenes:addLayer', { id, kind }),
    removeLayer: (id: string, layerId: string) => ipcRenderer.invoke('lumox:scenes:removeLayer', { id, layerId }),
    moveLayer:   (id: string, layerId: string, delta: number) => ipcRenderer.invoke('lumox:scenes:moveLayer', { id, layerId, delta }),
    setLayerEnabled: (id: string, layerId: string, enabled: boolean) => ipcRenderer.invoke('lumox:scenes:setLayerEnabled', { id, layerId, enabled }),
    setLayerTarget:  (id: string, layerId: string, mode: string, groupId?: string) => ipcRenderer.invoke('lumox:scenes:setLayerTarget', { id, layerId, mode, groupId }),
    setLayerOrder:   (id: string, layerId: string, order: string) => ipcRenderer.invoke('lumox:scenes:setLayerOrder', { id, layerId, order }),
    setLayerTiming:  (id: string, layerId: string, opts: unknown) => ipcRenderer.invoke('lumox:scenes:setLayerTiming', { id, layerId, ...(opts as object) }),
    setLayerConfig:  (id: string, layerId: string, cfg: unknown) => ipcRenderer.invoke('lumox:scenes:setLayerConfig', { id, layerId, ...(cfg as object) }),
    transport: (id: string, action: string) => ipcRenderer.invoke('lumox:scenes:transport', { id, action }),
    layerPhase: (id: string, layerId: string) => ipcRenderer.invoke('lumox:scenes:layerPhase', { id, layerId }),
  },
  transport: {
    get:        () => ipcRenderer.invoke('lumox:transport:get'),
    setBpm:     (bpm: number) => ipcRenderer.invoke('lumox:transport:setBpm', bpm),
    setSource:  (source: string, midiInput?: string | null) => ipcRenderer.invoke('lumox:transport:setSource', { source, midiInput }),
    audioBpm:   (bpm: number) => ipcRenderer.invoke('lumox:transport:audioBpm', bpm),
    midiInputs: () => ipcRenderer.invoke('lumox:transport:midiInputs'),
    onChanged:  (cb: Cb<unknown>) => ipcRenderer.on('transport:changed', (_e, s) => cb(s)),
  },
  palettes: {
    list:   ()   => ipcRenderer.invoke('lumox:palettes:list'),
    add:    (name: string, colors: string[]) => ipcRenderer.invoke('lumox:palettes:add', { name, colors }),
    rename: (id: string, name: string) => ipcRenderer.invoke('lumox:palettes:rename', { id, name }),
    remove: (id: string) => ipcRenderer.invoke('lumox:palettes:remove', id),
  },
  presets: {
    list:      ()   => ipcRenderer.invoke('lumox:presets:list'),
    saveRack:  (sceneId: string, name: string) => ipcRenderer.invoke('lumox:presets:saveRack', { sceneId, name }),
    applyRack: (sceneId: string, presetId: string) => ipcRenderer.invoke('lumox:presets:applyRack', { sceneId, presetId }),
    rename:    (id: string, name: string) => ipcRenderer.invoke('lumox:presets:rename', { id, name }),
    remove:    (id: string) => ipcRenderer.invoke('lumox:presets:remove', id),
  },
  banks: {
    list:   ()   => ipcRenderer.invoke('lumox:banks:list'),
    add:    (name?: string) => ipcRenderer.invoke('lumox:banks:add', { name }),
    rename: (id: string, name: string) => ipcRenderer.invoke('lumox:banks:rename', { id, name }),
    remove: (id: string) => ipcRenderer.invoke('lumox:banks:remove', id),
  },
  settings: {
    get:       () => ipcRenderer.invoke('lumox:settings:get'),
    update:    (patch: unknown) => ipcRenderer.invoke('lumox:settings:update', patch),
    onChanged: (cb: Cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
  },
  midi: {
    openWindow:        () => ipcRenderer.invoke('lumox:midi:openWindow'),
    status:            () => ipcRenderer.invoke('lumox:midi:status'),
    listBindings:      () => ipcRenderer.invoke('lumox:midi:listBindings'),
    beginAssign:       () => ipcRenderer.invoke('lumox:midi:beginAssign'),
    pickTarget:        (target: unknown) => ipcRenderer.invoke('lumox:midi:pickTarget', target),
    cancelAssign:      () => ipcRenderer.invoke('lumox:midi:cancelAssign'),
    setBindingOptions: (id: string, options: unknown) => ipcRenderer.invoke('lumox:midi:setBindingOptions', { id, options }),
    removeBinding:     (id: string) => ipcRenderer.invoke('lumox:midi:removeBinding', { id }),
    onStatus:        (cb: Cb<unknown>) => ipcRenderer.on('midi:status', (_e, s) => cb(s)),
    onBindings:      (cb: Cb<unknown[]>) => ipcRenderer.on('midi:bindings', (_e, b) => cb(b)),
    onAssignMode:    (cb: Cb<unknown>) => ipcRenderer.on('midi:assign-mode', (_e, a) => cb(a)),
    onAwaitingInput: (cb: Cb<unknown>) => ipcRenderer.on('midi:awaiting-input', (_e, a) => cb(a)),
    onMessage:       (cb: Cb<unknown>) => ipcRenderer.on('midi:message', (_e, m) => cb(m)),
    onFeedback:      (cb: Cb<unknown[]>) => ipcRenderer.on('midi:feedback', (_e, f) => cb(f)),
  },
  audio: {
    levels:            (frame: unknown) => ipcRenderer.invoke('lumox:audio:levels', frame),
    targets:           () => ipcRenderer.invoke('lumox:audio:targets'),
    listBindings:      () => ipcRenderer.invoke('lumox:audio:listBindings'),
    addBinding:        (source: unknown, target: unknown) => ipcRenderer.invoke('lumox:audio:addBinding', { source, target }),
    setBinding:        (id: string, patch: { source?: unknown; target?: unknown }) => ipcRenderer.invoke('lumox:audio:setBinding', { id, ...patch }),
    setBindingOptions: (id: string, options: unknown) => ipcRenderer.invoke('lumox:audio:setBindingOptions', { id, options }),
    removeBinding:     (id: string) => ipcRenderer.invoke('lumox:audio:removeBinding', { id }),
    onBindings:        (cb: Cb<unknown[]>) => ipcRenderer.on('audio:bindings', (_e, b) => cb(b)),
    onStream:          (cb: Cb<boolean>) => ipcRenderer.on('audio:stream', (_e, on) => cb(on)),
  },
  // Dev-only introspection bridge. The methods always exist here, but the main
  // handlers are registered only when LUMOX_DEV=1 — otherwise these invokes
  // reject with "No handler registered". See main/handlers/dev.ts + security.md.
  dev: {
    eval:  (code: string) => ipcRenderer.invoke('lumox:dev:eval', code),
    state: ()             => ipcRenderer.invoke('lumox:dev:state'),
  },
  win: {
    minimize:    () => ipcRenderer.invoke('lumox:win:minimize'),
    maximize:    () => ipcRenderer.invoke('lumox:win:maximize'),
    close:       () => ipcRenderer.invoke('lumox:win:close'),
    isMaximized: () => ipcRenderer.invoke('lumox:win:isMaximized'),
    onMaximized: (cb: Cb<boolean>) => ipcRenderer.on('win:maximized', (_e, v) => cb(v)),
    closeSelf:    () => ipcRenderer.invoke('lumox:win:closeSelf'),
    minimizeSelf: () => ipcRenderer.invoke('lumox:win:minimizeSelf'),
  },
});
