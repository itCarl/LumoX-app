# Renderer Reactivity (Signals)

**Status:** stable
**Files:** `renderer/lib/store.ts`; primitives from [`@preact/signals-core`](https://github.com/preactjs/signals)

## What

Fine-grained reactivity for **shared renderer state** — state read by more than
one dock tile — built on **`@preact/signals-core`** (a tiny, standard signals
library; no UI framework, no virtual DOM).

This is **not** a UI framework and does not replace `lib/dom.ts` (`html` + `mount`)
— rendering stays imperative. Signals only own the *state* layer; tiles still draw
with `mount().set(html\`…\`)`. Use a signal **only** for state genuinely shared
across tiles; tile-private state stays a plain variable.

## How

The three primitives come from `@preact/signals-core`:

- **`signal(initial)`** — a reactive cell. Read/write via the **`.value`** property
  (reading inside an effect subscribes that effect); **`.peek()`** reads without
  subscribing. A write of an `Object.is`-equal value is a no-op (no wake).
- **`effect(fn)`** — runs `fn` immediately, tracks every `.value` it reads, and
  re-runs whenever any of them changes. `fn` may return a cleanup function (run
  before each re-run and on dispose); the `effect()` call returns a disposer that
  stops it entirely.
- **`computed(fn)`** — a read-only derived signal, read via `.value` (lazy + memoised).

**Batching.** By default a write notifies its dependent effects synchronously.
Wrap multiple writes in **`batch(() => { … })`** to coalesce them into a single
flush so a burst of updates causes one re-render, not several.

**Dependency tracking** is automatic: each effect re-run re-collects the
`signal.value`s it reads, so stale subscriptions can't accumulate.

### Shared store (`store.ts`)

`store.ts` holds the app-wide signals (one source of truth per value). Today:

- **`activeGroup`** — the active fixture-group **highlight** (`'all'` or a group id).
  Written by the group bar (`views/groupbar.ts`); read inside an `effect()` by the
  patch grid and stage, which re-render the group outline automatically. There is no
  `GROUP_SELECTED` event and no echo-guard — the signal *is* the channel. It is a
  visual highlight only: the fader editor is driven by the **live selection**
  (`EV.FIXTURE_SELECTED`), not this signal — a group-bar tab click *also* selects
  its fixtures so a whole group can be edited (see [selection.md](selection.md)).

Consumer shape:

```ts
import { activeGroup } from '../lib/store';
import { effect } from '@preact/signals-core';

effect(() => { state.highlight = activeGroup.value; render(); });
```

## Signals vs. the event bus

Both still exist; they answer different questions.

- **`lib/store.ts` signal** — for a **shared value** consumers must mirror and
  re-render off (a single source of truth). Reactive: read it, you're subscribed.
- **`lib/bus.ts` event** — for a **notification / fire-and-forget fact** with no
  retained value: "the patch changed, reload", "a drag started/ended", selection
  echo tagged by `src`. These remain on the bus (`EV.PATCH_CHANGED`,
  `EV.GROUPS_CHANGED`, `EV.FIXTURE_SELECTED`, `EV.DRAG_*`, …).

Rule of thumb: if a tile keeps a *copy* of the value and re-renders when it
changes, it's a signal; if it just runs an action on an event, it's the bus.

## Notes / Gotchas

- An `effect()` runs **once synchronously** at creation — that initial run also
  performs the first render with whatever the signal currently holds. Place
  `effect()` wiring after the tile's `render()` (a hoisted function) and its mount
  handles exist. The async `load()/reload()` that follows re-renders with real
  data, so the initial empty render is harmless.
- Use `peek()` (not `.value`) when reading a signal **outside** reactive intent —
  e.g. inside an event handler or the writer's own logic — to avoid creating an
  unwanted subscription.
- Effects created per-tile currently live for the app's lifetime (tiles aren't
  torn down). If a tile ever becomes disposable, capture the disposer `effect()`
  returns and call it on teardown.
