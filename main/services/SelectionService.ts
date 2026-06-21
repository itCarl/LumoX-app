// SelectionService — the transient, ordered "programming target": fixture ids in
// selection order (1-based to the user). Any FX layer whose target is
// {mode:'selection'} fans across this pick instead of raw patch order, so a
// rainbow scrolls and a movement fans in the order the user selected. Runtime-only
// — never persisted (like the programmer); pruned to currently-patched fixtures on
// read.
//
// A selection change must re-fan any live scene that drives the selection. Rather
// than reach into the scene orchestrator (which would couple selection → scene
// compilation), this module exposes a change hook the runtime wiring connects to
// `rebuildSelectionTracks` at boot (see services/showRuntime.ts).

import { show } from '../context';

let selection: string[] = [];
const patched = (id: string): boolean => !!show.patch.get(id);

// Re-fan live selection-targeted scenes after a change. Set once at boot.
let onSelectionChanged: () => void = () => {};
export function setSelectionChangeHandler(fn: () => void): void { onSelectionChanged = fn; }

/** The active selection, pruned to patched fixtures, in selection order. */
export const getSelection = (): string[] => selection.filter(patched);

/** Replace the selection (kept in the given order, deduped + pruned), then
 *  refresh any live scene whose FX targets the selection. */
export function setSelection(ids: string[]): string[] {
  const seen = new Set<string>();
  selection = ids.filter((id) => patched(id) && !seen.has(id) && (seen.add(id), true));
  onSelectionChanged();
  return selection;
}

/** Patch-order id list — the candidate universe for invert. */
const patchOrder = (): string[] => show.patch.list().map((f) => f.id);

/** Quick-select / reorder ops over the active selection. Each computes the new
 *  ordered selection (some against the whole patch), stores it, and returns it. */
export function selectionOp(
  op: 'all' | 'invert' | 'reorder',
  arg: { from?: number; to?: number } = {},
): string[] {
  const cur = getSelection();
  let next = cur;
  switch (op) {
    case 'all': next = patchOrder(); break;
    case 'invert': { const set = new Set(cur); next = patchOrder().filter((id) => !set.has(id)); break; }
    case 'reorder': {                                  // drag row from→to within the selection
      next = [...cur];
      const { from = 0, to = 0 } = arg;
      if (from >= 0 && from < next.length && to >= 0 && to < next.length) {
        const [m] = next.splice(from, 1); next.splice(to, 0, m);
      }
      break;
    }
  }
  return setSelection(next);
}
