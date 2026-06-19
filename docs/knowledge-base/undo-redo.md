# Undo / Redo

**Status:** stable
**Files:** `main/services/HistoryService.ts`, `main/handlers/history.ts`,
`main/handlers/index.ts` (recording seam), `main/handlers/project.ts` +
`main/index.ts` (reset points), `preload.ts`, `renderer/lumox.d.ts`,
`renderer/index.ts` (shortcuts + ⋯ menu)

## What

Project-level undo/redo for every **saved-show** edit — patch, fixtures, groups,
scenes, FX layers, banks, palettes/presets, per-universe outputs, tempo. Driven
by **Ctrl+Z** / **Ctrl+Y** (Ctrl+Shift+Z also redoes) and the **Undo / Redo**
entries at the top of the ⋯ app menu (which show their enabled state).

Transient state is intentionally **not** undoable: live playback (scene recall),
the LIVE programmer, window/settings/discovery state, and the project commands
themselves. The undoable set is *exactly* the set that flags the project dirty.

## How

The **memento pattern** on top of the existing project (de)serialization — a
snapshot is just `buildProject()`, and undo/redo replace all state with
`restoreProject()` (the same path a project open uses). No per-command inverse
logic to maintain.

- **The seam.** `registerHandlers()` (`main/handlers/index.ts`) already wraps
  `ipcMain.handle` so any show-mutating channel flips the dirty flag. The same
  wrapper now also calls `recordHistory(channel)` — so *dirtying ⟺ undoable*, one
  place, automatically covering every current and future mutating channel.
- **HistoryService** holds the serialized `present` baseline plus `undoStack` /
  `redoStack` of project-JSON strings (capped at `MAX_DEPTH = 100`):
  - `recordHistory(channel)` — snapshots post-command state; if it differs from
    `present`, pushes the pre-command state onto the undo stack and clears redo.
    **No-op commands** (state unchanged) are skipped.
  - `undo()` / `redo()` — pop one stack, push `present` onto the other, restore,
    and `markDirty()` (content now differs from the last save).
  - `resetHistory()` — re-baseline to the current show and clear both stacks.
- **Coalescing.** A single gesture fires many IPC calls — dragging a fader/knob
  sends one per input event, and a group write sends one per fixture. Successive
  records on the **same channel** within `COALESCE_MS = 400` fold into one undo
  step (the pre-gesture state is already on the stack), so one drag = one undo.
- **Reset points** — `resetHistory()` runs after a full state replace so you
  can't undo across project boundaries: at boot (`main/index.ts bootShow`), on
  `lumox:project:new`, and on `lumox:project:open` (`main/handlers/project.ts`).
  Save does **not** reset (content is unchanged).
- **IPC** (`main/handlers/history.ts`): `lumox:history:undo` / `:redo` perform
  the step and, on a real change, broadcast `project:loaded` so the renderer
  `location.reload()`s into the restored state (same refresh as a project open);
  `lumox:history:state` returns `{ canUndo, canRedo }` for menu enablement. The
  `history` area is in `TRANSIENT_AREAS`, so the wrapper never records the
  undo/redo commands themselves.
- **Renderer** (`renderer/index.ts`): the global `keydown` handler maps
  Ctrl+Z/Y/Shift+Z, but **bails when focus is in an `<input>` / `<textarea>` /
  contenteditable** so native text editing keeps its own undo. The ⋯ menu fetches
  `lumox.history.state()` on open to disable Undo/Redo when their stack is empty.

## Notes / Gotchas

- **History is not persisted** — it lives in main-process memory and starts fresh
  each launch (and on new/open). Snapshots are full project JSON, so the cap keeps
  memory bounded.
- **Undo rebuilds tracks from scratch**, so a currently *recalled* (live) scene is
  reset to idle by an undo/redo — recall is transient and not part of the
  snapshot. Re-recall after undoing if you were editing a live look.
- Because the refresh reuses `project:loaded`, an undo does a full renderer reload
  (consistent with opening a project) rather than a surgical view patch.
- The undoable boundary is owned by `dirties()` in `main/handlers/index.ts`. A new
  mutating IPC area is undoable automatically; a new **transient** area must be
  added to `TRANSIENT_AREAS` (or its channels to `TRANSIENT_CHANNELS`) there.
