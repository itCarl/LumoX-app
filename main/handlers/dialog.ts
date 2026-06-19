// Generic dialog IPC — drives the small frameless dialog window that replaces
// the app's in-app modals (unsaved-changes prompt, notices, confirmations).
// `openDialog(spec)` opens the window and resolves with the clicked button id;
// closing the window (its X / Esc) resolves with the spec's `cancelId`.

import { ipcMain } from 'electron';
import { openDialogWindow, closeDialogWindow } from '../windows';

export type DialogVariant = 'default' | 'primary' | 'danger';
export interface DialogButton { id: string; label: string; variant?: DialogVariant; }
export interface DialogSpec {
  title: string;
  message: string;
  detail?: string;        // secondary, dimmed line
  list?: string[];        // optional bullet list (e.g. missing-fixture lines)
  buttons: DialogButton[];
  cancelId: string;       // id returned when the window is dismissed without a choice
  width?: number;
  height?: number;
}

let currentSpec: DialogSpec | null = null;
let pending: ((id: string) => void) | null = null;

/** Show the dialog window for `spec`; resolves with the chosen button id. */
export function openDialog(spec: DialogSpec): Promise<string> {
  pending?.(spec.cancelId);   // resolve any stale dialog (single at a time)
  return new Promise<string>((resolve) => {
    currentSpec = spec;
    pending = resolve;
    openDialogWindow(spec.width ?? 440, spec.height ?? 200, () => {
      // window closed without an explicit resolve → treat as cancel
      const r = pending; const cancel = currentSpec?.cancelId ?? 'cancel';
      pending = null; currentSpec = null;
      r?.(cancel);
    });
  });
}

export function registerDialogHandlers(): void {
  // Renderer-initiated dialogs (notices, confirmations) — open the window and
  // return the clicked button id, so a view can `await lumox.dialog.open(spec)`.
  ipcMain.handle('lumox:dialog:open', (_e, spec: DialogSpec) => openDialog(spec));
  // The dialog window fetches its spec on load.
  ipcMain.handle('lumox:dialog:spec', () => currentSpec);
  // …and reports the clicked button id. Closing the window does the rest.
  ipcMain.handle('lumox:dialog:resolve', (_e, id: string) => {
    const r = pending; const spec = currentSpec;
    pending = null; currentSpec = null;
    const valid = typeof id === 'string' && spec?.buttons.some((b) => b.id === id);
    closeDialogWindow();
    r?.(valid ? id : (spec?.cancelId ?? 'cancel'));
  });
}
