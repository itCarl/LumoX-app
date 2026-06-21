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
  FIXTURE_SELECTED: 'fixture-selected', // shared fixture selection (detail = {ids, src})
  DRAG_START: 'drag-start',           // dragging a fixture (detail = {span, moveId})
  DRAG_END: 'drag-end',               // drag finished/cancelled
  LIBRARY_CHANGED: 'library-changed', // fixture definitions added/removed
  SCENE_SELECTED: 'scene-selected',   // scene recalled for editing (detail = {id, name} | null)
  SCENE_DESELECTED: 'scene-deselected', // edit target explicitly cleared — no scene (vs SELECTED-null = re-resolve to active)
  SCENE_UPDATED: 'scene-updated',     // a scene's content/params changed (detail = sceneId)
  BANK_SELECTED: 'bank-selected',     // active bank tab changed (detail = bankId | null)
  TEMPO_CHANGED: 'tempo-changed',     // master BPM changed anywhere (detail = bpm number)
};
