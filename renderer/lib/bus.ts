// bus.js — minimal app-wide event bus so independent dock tiles can react to
// shared state changes (patch / groups) without direct references.

const target = new EventTarget();

export const bus = {
  emit(type: string, detail?: unknown) { target.dispatchEvent(new CustomEvent(type, { detail })); },
  on(type: string, cb: (detail: any) => void) {
    const handler = (e: Event) => cb((e as CustomEvent).detail);
    target.addEventListener(type, handler);
    return () => target.removeEventListener(type, handler);
  },
};

// event names
export const EV = {
  PATCH_CHANGED: 'patch-changed',     // fixtures added/removed/moved
  GROUPS_CHANGED: 'groups-changed',   // groups added/removed/renamed
  GROUP_SELECTED: 'group-selected',   // active group tab changed (detail = id|'all')
  DRAG_START: 'drag-start',           // dragging a fixture (detail = {span, moveId})
  DRAG_END: 'drag-end',               // drag finished/cancelled
  LIBRARY_CHANGED: 'library-changed', // fixture definitions added/removed
};
