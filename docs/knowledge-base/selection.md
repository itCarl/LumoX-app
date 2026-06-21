# Live selection — ordered programming target

The **selection** is the transient, *ordered* set of fixtures the user is
programming. Selection order is a first-class index (1-based to the user) that
decides how an effect fans/phases across the rig: select four PARs left→right and a
COLOR FX scrolls left→right; reverse the order and it scrolls right→left; mirror it
and the effect fans from the centre.

It is **runtime-only** (never written to the project, like the programmer) and
pruned to currently-patched fixtures.

## Where it lives

`main/services/SelectionService.ts` owns the canonical selection (`getSelection`,
`setSelection`, `selectionOp`). The engine stays fixture-agnostic;
`fixturesFor({mode:'selection'})` (`main/services/SceneCompiler.ts`)
resolves the ids to fixtures in selection order when building a scene track. Any
live scene with a selection-targeted layer is rebuilt the moment the selection
changes (`rebuildSelectionTracks`, opacity + phase preserved), so effects re-fan
live.

## FX target

An FX layer's **Target** can be `All` (rig, patch order), a **group** (membership
order), or **Selection** (selection order) — `FxTargetSel = {mode:'all'} |
{mode:'group',groupId} | {mode:'selection'}` (`src/show/Scene.ts`). The FX-rack
editor (`renderer/views/fxpalette.ts`) exposes Selection in the Target dropdown.
Combine it with the layer's **Order** (`patch | reverse | mirror | random`) for
further fanning.

### Preview ↔ selection link (numbered beam dots)

The FX preview graph draws one **beam dot** per target beam at its live phase,
**numbered with the stage selection badge** of the fixture it drives — so a moving
dot and the fixture tile on the stage carry the *same* number. Selected beams show
the badge in the accent colour; unselected beams recede (smaller, dim, no number).
With no beam in the current selection the graph falls back to plain `1..N` numbering.

The mapping rides a per-beam fixture id: `SceneCompiler` records the fixture behind
each target tuple (`TrackLayer.beamIds`), the serializer flattens it index-aligned
with the beam count into `FxLayerDTO.beamFixtureIds`, and the preview
(`fxpalette.ts`) looks each id up in the live selection order (mirrored off the
`EV.FIXTURE_SELECTED` bus).

## IPC — `lumox:selection:*` (transient, never dirties the project)

| Channel | Action |
| --- | --- |
| `:get` | current selection ids (pruned, in order) |
| `:set` | replace (deduped + pruned); the plain mirror of a click/marquee — does **not** broadcast |
| `:add` / `:remove` / `:clear` | mutate the selection |
| `:all` / `:invert` | whole-patch ops (against patch order) |
| `:reorder` (from, to) | move one row within the selection |

Every op except `:set` broadcasts `selection:changed` to the renderer.
`main/handlers/selection.ts`; preload namespace `lumox.selection.*`.

## Renderer flow

The stage (`views/stage.ts`) and patch grid (`views/patchgrid.ts`) keep an
insertion-ordered selection mirrored between themselves via the `EV.FIXTURE_SELECTED`
bus. A **plain click** selects only that fixture; **Ctrl/⌘-click appends in click
order**. Clicking an **already-selected fixture in a multi-selection drops just that
one** (the rest stay) — on the stage a *drag* still moves the whole group, so the
deselect resolves on mouse-up only when the click didn't move. A **marquee/lasso
numbers its catch in reading order** (top-to-bottom rows, then left-to-right —
appended after any already-selected fixtures when additive), so the index follows how
you read the rig.
Both paint a 1-based **index badge** (`.st-idx` / `.pg-idx`) on each selected fixture.
On the stage the badge sits **centred on the fixture** and is the *only* per-fixture
selection marker — there is no selection outline on the node itself.

### Selection-gated editors

The selection is also the **edit target** for the per-fixture editor tiles, which
subscribe to the same `EV.FIXTURE_SELECTED` bus and seed from `lumox.selection.get`:

- **Fader editor** (`views/fadereditor.ts`, CONTROL) — console-style **gated on the
  selection**: it shows one strip per channel of the selected fixtures (one block per
  channel-config, broadcasting to every selected fixture of that type, in selection
  order). With nothing selected the strip area is unavailable. A **group-bar tab click
  selects that group's fixtures** ("All" → the whole rig via `lumox.selection.all`), so
  a group tab is the quick "edit this whole group" gesture while still highlighting the
  group (`activeGroup`) on the stage/grid. See [mix-engine.md](mix-engine.md#fader-editor--edit-vs-live).
- **Limits tile** (`views/limits-tile.ts`, SETUP) — edits the selection's output
  limits; see [limits.md](limits.md).

## Stage selection & order helpers

The stage rail (and a right-click context menu on the canvas) expose quick ops that
edit the selection set or its order, broadcasting through the same bus:

- **Select all / none / invert** — whole-rig membership.
- **Keep every Nth — ½ / ⅓ / ¼** — thin the current selection (or all, if none) to
  every 2nd/3rd/4th fixture in **reading order** (top-to-bottom rows, then left-to-right).
- **Shift selection ± one** — slide the whole selection one fixture along reading
  order (wraps), for stepping a sub-pattern across the rig.
- **Invert order** — reverse the selection's order (flips the fan direction).
- **Symmetry** — re-order by interleaving from both ends (outer pair first … centre
  last) so an index-driven FX fans symmetrically about the centre — the order-model
  mirror of duplicate indices (the selection is a flat ordered list). (An FX layer
  can also mirror at fan time via its **Order**, above.)

These change the ordered selection itself (renumbering badges live), distinct from a
layer's per-layer **Order** transform.

### Context-menu grouping & save (canvas right-click only)

Right-clicking the canvas (the shared `openMenu` widget) adds **grouping** and
**save** actions on top of the rail ops — a right-click on an unselected fixture
selects it first, so the actions always have a target:

- **Save selection** — capture the live selection (in order) as a named saved
  selection in the right rail, dropping straight into rename (same as the rail's Save).
- **New group from selection** — create a group from the selected fixtures. Disabled
  (with an explaining tooltip) when the selection spans channel configs (a group holds
  **one** config — see [groups]).
- **Add to group…** — a second menu listing the groups whose channel config matches
  the selection; picking one adds the selected fixtures to it.
- **Remove from "…"** (named for the active group) — shown only when the active group
  tab holds some of the selection; removes those fixtures from it.

Grouping ops go through `lumox.groups.add` / `lumox.groups.setFixtures` and broadcast
`GROUPS_CHANGED` + `PATCH_CHANGED`.

[groups]: #saved-named-selections

## Stage arrangement (positions, not selection)

**Fixed stage box.** Fixtures live inside a bounded **16:9 stage** (`STAGE_SIZE`,
64×36 world units) drawn as a bordered, grid-ruled box; the view zooms/pans within it
(**Fit** frames the fixtures, not the whole box) and drags are clamped to it. Newly
added fixtures spawn **clustered at the stage centre**. Each fixture renders as its
real emitter grid painted with **live mixed-output colour** (polled ~15 fps), framed
by a thin **group-coloured footprint outline** drawn over the emitter dots so the
fixture stays distinct even when lit bright, plus its index badge when selected.
Selection clicks repaint only that overlay (`paintSelection` — the `.sel` class,
badges and the box), never the geometry, so picking a fixture doesn't re-tear the
emitter dots and flash the rig. Placements persist
**normalised** (0..1 per axis) — see
[fixtures.md](fixtures.md#emitter-geometry--stage-placement-emittergeometryts-fixturestagetransform).
The saved-selections rail on the right is **collapsible** (the `‹ / ›` toggle).

> **SETUP-only.** The stage tile is shared between tabs, but **positioning only happens
> in SETUP**. In **CONTROL** the stage is **selection-only**: the positioning controls
> (arrange / align / distribute / rotation rail groups) and the selection box's
> rotate/resize handles are hidden, and a click just selects — you pick fixtures to
> program, never move them. `views/stage.ts` `setMode(tab)` (called from the tab switch
> in `renderer/index.ts`) toggles `.mode-control` and gates the move/rotate/resize
> gestures on `state.mode`.

The same rail/menu also arrange the selected fixtures' **stage transforms** (persisted
via `lumox.patch.setTransform`): **align** (l/c/r, t/c/b), **distribute** (h/v), and
**arrange in a grid / line / circle**. Circle/line lay fixtures out in **selection
order**, so the visual layout and the FX index order agree.

**Reset stage** (toolbar `⤢` / context menu) discards all manual placement: it
re-clusters **every** fixture at the stage centre and clears rotation — a normal,
undoable edit, then re-frames the view.

**Rotation** — the live selection is framed by a dashed **bounding box with a round
rotate handle at each corner** (`.st-selbox` / `.st-selrot`); drag any corner to spin,
or Ctrl/Alt-drag a fixture directly. **Shift snaps to 15°**. The selection rotates as a
**rigid body about the box centre** — every fixture both *orbits* that centre and spins
by the same angle (rotating the whole rig like a truss), so positions and orientations
stay coherent; a single fixture therefore just spins in place. On release the set is
nudged back to x,y ≥ 0 so a rotation near the origin can't swing fixtures off the
canvas. **Reset rotation** zeros the angle (selection, or the whole rig if none).

**Resize / scale** — for 2+ selected fixtures the box also shows **square edge handles**
(`.st-selsize`); dragging one scales the selection's *spread* uniformly about the box
centre — each fixture's position moves in/out by the same factor while footprints and
rotations stay fixed. So an arranged ring changes diameter, a row gets longer/shorter,
a grid spreads or tightens. (Single-fixture selections hide the edge handles — there's
nothing to spread.)

The bounding box **and its grab handles scale with the zoom** (the box geometry from
`zoom`, the handles from the `--handle` / `--handle-e` CSS vars set in `applyZoom`,
clamped to a grabbable min / sane max), so the handles stay proportional to the
fixtures instead of burying a small rig when zoomed out.

`renderer/lib/selection.ts` bridges that bus to main's canonical selection:

```text
click / marquee ──FIXTURE_SELECTED──► bridge ──lumox.selection.set──► main
main quick-op   ──selection:changed──► bridge ──FIXTURE_SELECTED(src:'main')──► views adopt
```

The `src:'main'` tag lets the views adopt a main-driven reorder while the bridge
ignores its own echo. When main reorders the selection, the new ids flow back
through this bridge, renumbering the badges live.

### Selecting a scene auto-selects its fixtures

Selecting a scene for editing (the colour strip in the Banks tile,
`views/banks.ts`) also **selects that scene's fixtures on the stage**, so they're
ready to tweak and become the live target for any selection-driven FX. The set is
`SceneDTO.fixtureIds` — every fixture the scene drives, in patch order, computed by
the serializer (`sceneFixtureIds`): fixtures with a captured value anywhere in their
DMX footprint (base look or any chase step) **plus** any fixture an FX layer targets
(via the track's per-layer `beamIds`), so a pure-FX scene — e.g. a matrix look that
stores no static values — still selects the rig its effect animates. Banks emits it
on the same `EV.FIXTURE_SELECTED` bus (`src:'banks'`), so the stage adopts it and the
bridge pushes it to main. A scene that drives nothing at all selects nothing.

## Saved (named) selections

A **saved selection** is a named, **ordered** subset of fixtures stored in the show
and recalled later as the live selection — the quick way to keep several programming
picks (e.g. "Odd PARs", "Front truss L→R") with their own index order. **Distinct
from groups**: a group is structural (one channel-config, auto-created on patch); a
saved selection is a free, curated pick across any fixtures whose **order is the
point** (it becomes the FX fan index on recall).

- **Model:** `SavedSelection { id, name, fixtureIds[] }` on the `Show`
  (`show.selections`, `src/show/Show.ts`); persisted in the project (`selections`
  array), covered by undo/redo whole-show snapshots, and pruned to patched fixtures.
- **Recall** loads the saved order into the canonical live selection (`setSelection`)
  and broadcasts `selection:changed`, so badges + any `{mode:'selection'}` FX adopt it
  — the same path a quick-op uses. Recall is **transient** (doesn't dirty the project).
- **UI:** a **right-side rail** on the stage (mirroring the left tools rail) — a **Save**
  button captures the current selection (in order; auto-named `Selection N`), then each
  entry **recalls** on click, renames on double-click, and deletes with ×. Deleting a
  fixture purges it from every saved selection (empty ones are dropped).

### IPC — `lumox:selections:*` (plural; saved show state)

| Channel | Action |
| --- | --- |
| `:list` | saved selections (pruned) |
| `:save` (fixtureIds, name?) | create from the given ids, in order |
| `:rename` (id, name) / `:remove` (id) | edit / delete |
| `:setFixtures` (id, fixtureIds) | replace ordered membership |
| `:recall` (id) | load into the live selection + broadcast (transient) |

`main/handlers/selections.ts`; preload `lumox.selections.*`. All but `:list`/`:recall`
dirty the project (and record undo history) via the IPC wrapper.

## Group fixture order

A group's stored `fixtureIds` order is its own "fixture index": an FX layer
targeting a group fans/phases across it in that order. Right-click a group tab in
the group bar → **Edit order…** opens a drag-to-reorder modal
(`renderer/views/group-order-modal.ts`); dropping a row persists the new order via
`lumox.groups.setFixtures(id, orderedIds)`, which re-fans live FX immediately.
