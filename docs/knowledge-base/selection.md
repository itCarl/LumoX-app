# Live selection — ordered programming target

The **selection** is the transient, *ordered* set of fixtures the user is
programming. Selection order is a first-class index (1-based to the user): it
decides how an effect fans/phases across the rig. Select four PARs left→right and
a COLOR FX scrolls left→right; reverse the order and it scrolls right→left;
mirror it and the effect fans from the centre.

It is **runtime-only** — never written to the project (like the programmer). It
is pruned to currently-patched fixtures.

## Where it lives

`main/context.ts` owns the canonical selection (`getSelection`, `setSelection`,
`selectionOp`). The engine stays fixture-agnostic; `fixturesFor({mode:'selection'})`
resolves the ids to fixtures in selection order when building a scene track. Any
live scene with a selection-targeted layer is rebuilt the moment the selection
changes (`rebuildSelectionTracks`, opacity + phase preserved), so effects re-fan
live.

## FX target

An FX layer's **Target** can be `All` (rig, patch order), a **group** (membership
order), or **Selection** (selection order) — `FxTargetSel = {mode:'all'} |
{mode:'group',groupId} | {mode:'selection'}` (`src/show/Scene.ts`). The FX-rack
editor (`renderer/views/fxpalette.ts`) exposes the Selection option in the Target
dropdown. Combine it with the layer's **Order** (`patch | reverse | mirror |
random`) for further fanning.

## IPC — `lumox:selection:*` (transient, never dirties the project)

| Channel | Action |
| --- | --- |
| `:get` | current selection ids (pruned, in order) |
| `:set` | replace (deduped + pruned); the plain mirror of a click/marquee — does **not** broadcast |
| `:add` / `:remove` / `:clear` | mutate the selection |
| `:all` / `:invert` | whole-patch ops (against patch order) |
| `:reverse` / `:mirror` | reorder the current selection (mirror = centre-out) |
| `:everyNth` (n, offset) | thin to every n-th pick |
| `:shift` (delta) | step each pick ±delta in patch order (wraps) |
| `:reorder` (from, to) | move one row within the selection |

Every op except `:set` broadcasts `selection:changed` to the renderer.
`main/handlers/selection.ts`; preload namespace `lumox.selection.*`.

## Renderer flow

The stage (`views/stage.ts`) and patch grid (`views/patchgrid.ts`) keep an
insertion-ordered selection mirrored between themselves via the `EV.FIXTURE_SELECTED`
bus (Ctrl/⌘-click appends; marquee/lasso select a region). Both paint a 1-based
**index badge** (`.st-idx` / `.pg-idx`) on each selected fixture.

`renderer/lib/selection.ts` bridges that bus to main's canonical selection:

```text
click / marquee ──FIXTURE_SELECTED──► bridge ──lumox.selection.set──► main
main quick-op   ──selection:changed──► bridge ──FIXTURE_SELECTED(src:'main')──► views adopt
```

The `src:'main'` tag lets the views adopt a main-driven reorder while the bridge
ignores its own echo. The stage left rail's **Selection order** group
(reverse / mirror / shift ◀▶ / ½ / ⅓) calls the IPC and the reordered ids flow
back through this bridge, renumbering the badges live.

## Group fixture order

A group's stored `fixtureIds` order is its own "fixture index": an FX layer
targeting a group fans/phases across it in that order. Right-click a group tab in
the group bar → **Edit order…** opens a drag-to-reorder modal
(`renderer/views/group-order-modal.ts`); dropping a row persists the new order via
`lumox.groups.setFixtures(id, orderedIds)`, which re-fans live FX immediately.
