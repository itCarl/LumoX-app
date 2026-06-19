// confirm.ts — confirmation dialog over the generic dialog WINDOW (a real
// taskbar window, not an in-app modal). Resolves Promise<boolean>: true if
// confirmed, false if cancelled (Cancel button, the window's X, or Escape).
//
// Pass `onConfirm` to run an async action when confirmed; if it throws, the
// error is surfaced in a follow-up notice window and `false` is returned (so a
// refused delete, say, shows its reason instead of failing silently).

const { lumox } = window;

export interface ConfirmOpts {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
  /** Action to run on confirm; thrown errors are shown in a notice window. */
  onConfirm?: () => void | Promise<void>;
}

export async function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  const choice = await lumox.dialog.open({
    title: opts.title,
    message: opts.message,
    detail: opts.detail,
    buttons: [
      { id: 'cancel', label: opts.cancelLabel ?? 'Cancel' },
      { id: 'confirm', label: opts.confirmLabel ?? 'Confirm', variant: opts.danger ? 'danger' : 'primary' },
    ],
    cancelId: 'cancel',
    width: 460, height: 190,
  });
  if (choice !== 'confirm') return false;

  if (opts.onConfirm) {
    try {
      await opts.onConfirm();
    } catch (err) {
      await lumox.dialog.open({
        title: opts.title,
        message: String((err as Error)?.message ?? err).replace(/^Error:\s*/, ''),
        buttons: [{ id: 'ok', label: 'OK', variant: 'primary' }],
        cancelId: 'ok',
        width: 460, height: 170,
      });
      return false;
    }
  }
  return true;
}
