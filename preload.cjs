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
  },
  engine: {
    start: () => ipcRenderer.invoke('lumox:engine:start'),
    stop:  () => ipcRenderer.invoke('lumox:engine:stop'),
  },
});
