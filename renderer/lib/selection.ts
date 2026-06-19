// Selection bridge — keeps main's canonical ordered "programming selection" in
// sync with the renderer's shared fixture selection (the `EV.FIXTURE_SELECTED`
// bus that the stage and patch grid already mirror between themselves).
//
//   user click / marquee  ──FIXTURE_SELECTED──►  here ──lumox.selection.set──►  main
//   main quick-op (invert/reverse/…)  ──selection:changed──►  here ──FIXTURE_SELECTED(src:'main')──►  views
//
// The `src:'main'` tag lets views adopt a main-driven reorder while this bridge
// ignores it (so it never echoes back). A small key guard suppresses redundant
// round-trips when the ids are unchanged.

import { bus, EV } from './bus';

const { lumox } = window;
let last = '';   // serialized last-synced selection — suppresses echo loops

export function initSelectionBridge(): void {
  // View → main: a click/marquee selection becomes the live programming target.
  bus.on(EV.FIXTURE_SELECTED, (d: { ids: string[]; src: string }) => {
    if (!d || d.src === 'main') return;          // our own echo — don't push back
    const key = d.ids.join(',');
    if (key === last) return;
    last = key;
    void lumox.selection.set(d.ids);
  });

  // Main → views: a quick-op reordered the selection; broadcast it for badges.
  lumox.selection.onChanged((ids: string[]) => {
    last = ids.join(',');
    bus.emit(EV.FIXTURE_SELECTED, { ids, src: 'main' });
  });
}
