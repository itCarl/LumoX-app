// Preload — exposes `window.lumox.*` to the renderer with no Node access.
// Mirrors handlers in main/index.ts. Extend as UI grows.
// Bundled by esbuild to dist/preload.cjs (CommonJS — Electron preload req.).

import { contextBridge, ipcRenderer } from 'electron';

type Cb<T = void> = (value: T) => void;

contextBridge.exposeInMainWorld('lumox', {
  outputs: {
    list:      ()       => ipcRenderer.invoke('lumox:outputs:list'),
    available: ()       => ipcRenderer.invoke('lumox:outputs:available'),
    create:    (type: string, config: unknown) => ipcRenderer.invoke('lumox:outputs:create', { type, config }),
    update:    (opts: unknown)   => ipcRenderer.invoke('lumox:outputs:update', opts),
    remove:    (id: string)     => ipcRenderer.invoke('lumox:outputs:remove', id),
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
    list:         () => ipcRenderer.invoke('lumox:library:list'),
    channelTypes: () => ipcRenderer.invoke('lumox:library:channelTypes'),
    add:          (def: unknown) => ipcRenderer.invoke('lumox:library:add', def),
    onChanged:    (cb: Cb) => ipcRenderer.on('library:changed', () => cb()),
  },
  editor: {
    open: () => ipcRenderer.invoke('lumox:editor:open'),
  },
  project: {
    save: () => ipcRenderer.invoke('lumox:project:save'),
    open: () => ipcRenderer.invoke('lumox:project:open'),
    onLoaded: (cb: Cb) => ipcRenderer.on('project:loaded', () => cb()),
  },
  patch: {
    list:     ()   => ipcRenderer.invoke('lumox:patch:list'),
    add:      (opts: unknown) => ipcRenderer.invoke('lumox:patch:add', opts),
    move:     (opts: unknown) => ipcRenderer.invoke('lumox:patch:move', opts),
    remove:   (id: string) => ipcRenderer.invoke('lumox:patch:remove', id),
    rename:   (id: string, name: string) => ipcRenderer.invoke('lumox:patch:rename', { id, name }),
    overlaps: ()   => ipcRenderer.invoke('lumox:patch:overlaps'),
  },
  groups: {
    list:        ()   => ipcRenderer.invoke('lumox:groups:list'),
    add:         (opts: unknown) => ipcRenderer.invoke('lumox:groups:add', opts),
    remove:      (id: string) => ipcRenderer.invoke('lumox:groups:remove', id),
    setFixtures: (id: string, fixtureIds: string[]) => ipcRenderer.invoke('lumox:groups:setFixtures', { id, fixtureIds }),
    rename:      (id: string, name?: string, color?: string) => ipcRenderer.invoke('lumox:groups:rename', { id, name, color }),
  },
  fixtures: {
    setChannel: (fixtureId: string, channel: number, value: number) =>
      ipcRenderer.invoke('lumox:fixtures:setChannel', { fixtureId, channel, value }),
  },
  scenes: {
    list:    ()   => ipcRenderer.invoke('lumox:scenes:list'),
    capture: (bankId?: string, name?: string) => ipcRenderer.invoke('lumox:scenes:capture', { bankId, name }),
    recall:  (id: string, on: boolean) => ipcRenderer.invoke('lumox:scenes:recall', { id, on }),
    remove:  (id: string) => ipcRenderer.invoke('lumox:scenes:remove', id),
    rename:  (id: string, name: string) => ipcRenderer.invoke('lumox:scenes:rename', { id, name }),
    update:  (id: string) => ipcRenderer.invoke('lumox:scenes:update', id),
    setColor: (id: string, color: string) => ipcRenderer.invoke('lumox:scenes:setColor', { id, color }),
    duplicate: (id: string) => ipcRenderer.invoke('lumox:scenes:duplicate', id),
  },
  banks: {
    list:   ()   => ipcRenderer.invoke('lumox:banks:list'),
    add:    (name?: string) => ipcRenderer.invoke('lumox:banks:add', { name }),
    rename: (id: string, name: string) => ipcRenderer.invoke('lumox:banks:rename', { id, name }),
    remove: (id: string) => ipcRenderer.invoke('lumox:banks:remove', id),
  },
  win: {
    minimize:    () => ipcRenderer.invoke('lumox:win:minimize'),
    maximize:    () => ipcRenderer.invoke('lumox:win:maximize'),
    close:       () => ipcRenderer.invoke('lumox:win:close'),
    isMaximized: () => ipcRenderer.invoke('lumox:win:isMaximized'),
    onMaximized: (cb: Cb<boolean>) => ipcRenderer.on('win:maximized', (_e, v) => cb(v)),
    closeSelf:   () => ipcRenderer.invoke('lumox:win:closeSelf'),
  },
});
