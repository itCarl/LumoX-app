// HistoryService — project-level undo / redo via whole-show snapshots (the
// memento pattern). A snapshot is the serialized project (`buildProject`); undo
// and redo replace all state with `restoreProject`. The set of undoable commands
// is exactly the set the dirty-flag tracks (see `main/handlers/index.ts`
// `dirties`), so history covers every saved-show edit and nothing transient
// (live output, playback, programmer, window/settings state).
//
// Rapid edits from a single gesture (dragging a fader or knob fires one IPC call
// per pixel, and a group write fires one per fixture) are *coalesced* into one
// undo step by a short idle window keyed on the channel, so an undo reverts the
// whole gesture rather than one micro-step at a time.

import { buildProject, restoreProject, markDirty } from './ProjectService';
import type { ProjectData } from '../dto';

const MAX_DEPTH = 100;     // cap stack memory — each entry is one project JSON
const COALESCE_MS = 400;   // merge same-channel edits closer together than this

export interface HistoryState { canUndo: boolean; canRedo: boolean; }

let present = '';                 // serialized current state (the live baseline)
const undoStack: string[] = [];   // older states (top = the previous step)
const redoStack: string[] = [];   // newer states (top = the next step)
let lastChannel: string | null = null;
let lastAt = 0;

const snapshot = (): string => JSON.stringify(buildProject());

export const historyState = (): HistoryState => ({
  canUndo: undoStack.length > 0,
  canRedo: redoStack.length > 0,
});

/** Re-baseline to the current show and drop all history. Call on new/open/boot. */
export function resetHistory(): void {
  present = snapshot();
  undoStack.length = 0;
  redoStack.length = 0;
  lastChannel = null;
  lastAt = 0;
}

/**
 * Record the result of a just-applied mutating command: push the pre-command
 * state onto the undo stack (unless it folds into the current gesture) and clear
 * the redo stack. No-op commands (state unchanged) are ignored.
 */
export function recordHistory(channel: string): void {
  const next = snapshot();
  if (next === present) return;               // command changed nothing

  const now = Date.now();
  const sameGesture = channel === lastChannel && now - lastAt < COALESCE_MS;
  lastChannel = channel;
  lastAt = now;

  if (sameGesture) {
    // Continuation of a drag / multi-fixture write — the pre-gesture state is
    // already on the undo stack; just advance the baseline.
    present = next;
    return;
  }

  undoStack.push(present);
  if (undoStack.length > MAX_DEPTH) undoStack.shift();
  redoStack.length = 0;
  present = next;
}

/** Step back one command. Returns true if state changed. */
export async function undo(): Promise<boolean> {
  const prev = undoStack.pop();
  if (prev === undefined) return false;
  redoStack.push(present);
  present = prev;
  await restoreProject(JSON.parse(prev) as ProjectData);
  lastChannel = null;          // the next edit starts a fresh gesture
  markDirty();
  return true;
}

/** Step forward one undone command. Returns true if state changed. */
export async function redo(): Promise<boolean> {
  const next = redoStack.pop();
  if (next === undefined) return false;
  undoStack.push(present);
  present = next;
  await restoreProject(JSON.parse(next) as ProjectData);
  lastChannel = null;
  markDirty();
  return true;
}
