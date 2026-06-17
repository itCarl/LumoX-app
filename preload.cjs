// Preload — exposes `window.lumox.*` to the renderer with no Node access.
// Mirrors handlers in main/index.js. Extend as UI grows.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lumox', {
  outputs: {
    list:      ()       => ipcRenderer.invoke('lumox:outputs:list'),
    available: ()       => ipcRenderer.invoke('lumox:outputs:available'),
    create:    (type, config) => ipcRenderer.invoke('lumox:outputs:create', { type, config }),
    remove:    (id)     => ipcRenderer.invoke('lumox:outputs:remove', id),
  },
  universes: {
    list:       ()      => ipcRenderer.invoke('lumox:universes:list'),
    ensure:     (id, name) => ipcRenderer.invoke('lumox:universes:ensure', { id, name }),
    setChannel: (id, channel, value) =>
      ipcRenderer.invoke('lumox:universes:setChannel', { id, channel, value }),
    read:       (id)    => ipcRenderer.invoke('lumox:universes:read', id),
  },
  master: {
    set: (value) => ipcRenderer.invoke('lumox:master:set', value),
  },
  blackout: {
    set: (active) => ipcRenderer.invoke('lumox:blackout:set', active),
  },
  engine: {
    start:  () => ipcRenderer.invoke('lumox:engine:start'),
    stop:   () => ipcRenderer.invoke('lumox:engine:stop'),
    status: () => ipcRenderer.invoke('lumox:engine:status'),
  },
  library: {
    list:         () => ipcRenderer.invoke('lumox:library:list'),
    channelTypes: () => ipcRenderer.invoke('lumox:library:channelTypes'),
    add:          (def) => ipcRenderer.invoke('lumox:library:add', def),
    onChanged:    (cb) => ipcRenderer.on('library:changed', () => cb()),
  },
  editor: {
    open: () => ipcRenderer.invoke('lumox:editor:open'),
  },
  patch: {
    list:     ()   => ipcRenderer.invoke('lumox:patch:list'),
    add:      (opts) => ipcRenderer.invoke('lumox:patch:add', opts),
    move:     (opts) => ipcRenderer.invoke('lumox:patch:move', opts),
    remove:   (id) => ipcRenderer.invoke('lumox:patch:remove', id),
    rename:   (id, name) => ipcRenderer.invoke('lumox:patch:rename', { id, name }),
    overlaps: ()   => ipcRenderer.invoke('lumox:patch:overlaps'),
  },
  groups: {
    list:        ()   => ipcRenderer.invoke('lumox:groups:list'),
    add:         (opts) => ipcRenderer.invoke('lumox:groups:add', opts),
    remove:      (id) => ipcRenderer.invoke('lumox:groups:remove', id),
    setFixtures: (id, fixtureIds) => ipcRenderer.invoke('lumox:groups:setFixtures', { id, fixtureIds }),
    rename:      (id, name, color) => ipcRenderer.invoke('lumox:groups:rename', { id, name, color }),
  },
  fixtures: {
    setChannel: (fixtureId, channel, value) =>
      ipcRenderer.invoke('lumox:fixtures:setChannel', { fixtureId, channel, value }),
  },
  scenes: {
    list:    ()   => ipcRenderer.invoke('lumox:scenes:list'),
    capture: (bankId, name) => ipcRenderer.invoke('lumox:scenes:capture', { bankId, name }),
    recall:  (id, on) => ipcRenderer.invoke('lumox:scenes:recall', { id, on }),
    remove:  (id) => ipcRenderer.invoke('lumox:scenes:remove', id),
    rename:  (id, name) => ipcRenderer.invoke('lumox:scenes:rename', { id, name }),
  },
  banks: {
    list:   ()   => ipcRenderer.invoke('lumox:banks:list'),
    add:    (name) => ipcRenderer.invoke('lumox:banks:add', { name }),
    rename: (id, name) => ipcRenderer.invoke('lumox:banks:rename', { id, name }),
    remove: (id) => ipcRenderer.invoke('lumox:banks:remove', id),
  },
  win: {
    minimize:    () => ipcRenderer.invoke('lumox:win:minimize'),
    maximize:    () => ipcRenderer.invoke('lumox:win:maximize'),
    close:       () => ipcRenderer.invoke('lumox:win:close'),
    isMaximized: () => ipcRenderer.invoke('lumox:win:isMaximized'),
    onMaximized: (cb) => ipcRenderer.on('win:maximized', (_e, v) => cb(v)),
    closeSelf:   () => ipcRenderer.invoke('lumox:win:closeSelf'),
  },
});
