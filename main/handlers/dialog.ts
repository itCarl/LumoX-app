// Generic dialog IPC — drives the small frameless dialog window that replaces
// the app's in-app modals (unsaved-changes prompt, notices, confirmations) AND
// text prompts (rename a scene/bank/group, name a new preset/palette).
// `openDialog(spec)` resolves with the clicked button id; `openPrompt(spec)`
// (an `input` spec) resolves with the entered text, or null when cancelled.
// Closing the window (its X / Esc) resolves with the spec's `cancelId`.

import { ipcMain } from 'electron';
import { openDialogWindow, closeDialogWindow } from '../windows';

export type DialogVariant = 'default' | 'primary' | 'danger';
export interface DialogButton { id: string; label: string; variant?: DialogVariant; }
export interface DialogSpec {
  title: string;
  message: string;
  detail?: string;        // secondary, dimmed line
  list?: string[];        // optional bullet list (e.g. missing-fixture lines)
  input?: { value?: string; placeholder?: string };   // present → render a single text field (a rename/name prompt)
  buttons: DialogButton[];
  cancelId: string;       // id returned when the window is dismissed without a choice
  width?: number;
  height?: number;
}

interface DialogResult { id: string; value?: string }
let currentSpec: DialogSpec | null = null;
let pending: ((r: DialogResult) => void) | null = null;

/** Show the dialog window for `spec`; resolves with the chosen button id (+ the
 *  text-field value when the spec carries an input). */
function show(spec: DialogSpec): Promise<DialogResult> {
  pending?.({ id: spec.cancelId });   // resolve any stale dialog (single at a time)
  return new Promise<DialogResult>((resolve) => {
    currentSpec = spec;
    pending = resolve;
    openDialogWindow(spec.width ?? 440, spec.height ?? 200, () => {
      // window closed without an explicit resolve → treat as cancel
      const r = pending; const cancel = currentSpec?.cancelId ?? 'cancel';
      pending = null; currentSpec = null;
      r?.({ id: cancel });
    });
  });
}

/** Button prompt / notice — resolves with the clicked button id. */
export function openDialog(spec: DialogSpec): Promise<string> {
  return show(spec).then((r) => r.id);
}

/** Text prompt (rename / name a new item) — resolves with the entered string, or
 *  null when cancelled / dismissed. The caller supplies an `input` + buttons. */
export function openPrompt(spec: DialogSpec): Promise<string | null> {
  return show(spec).then((r) => (r.id === spec.cancelId ? null : (r.value ?? null)));
}

export function registerDialogHandlers(): void {
  // Renderer-initiated dialogs (notices, confirmations) — open the window and
  // return the clicked button id, so a view can `await lumox.dialog.open(spec)`.
  ipcMain.handle('lumox:dialog:open', (_e, spec: DialogSpec) => openDialog(spec));
  // Renderer-initiated text prompt — returns the entered string (or null).
  ipcMain.handle('lumox:dialog:prompt', (_e, spec: DialogSpec) => openPrompt(spec));
  // The dialog window fetches its spec on load.
  ipcMain.handle('lumox:dialog:spec', () => currentSpec);
  // …and reports the clicked button id (+ any text value). Closing does the rest.
  ipcMain.handle('lumox:dialog:resolve', (_e, id: string, value?: string) => {
    const r = pending; const spec = currentSpec;
    pending = null; currentSpec = null;
    const valid = typeof id === 'string' && spec?.buttons.some((b) => b.id === id);
    closeDialogWindow();
    r?.({ id: valid ? id : (spec?.cancelId ?? 'cancel'), value });
  });
}
