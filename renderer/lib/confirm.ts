// confirm.ts — modal confirmation dialog over the shared `.lx-modal` markup (see
// settings-modal). Resolves a Promise<boolean>: true if confirmed, false if the
// user cancels (Cancel button, backdrop click, or Escape).
//
// Pass `onConfirm` to run an async action when confirmed: the buttons disable
// while it runs, and if it throws the error is shown inline and the dialog stays
// open (so a refused delete, say, surfaces its reason instead of failing silently).

import { node, html } from './dom';
import { button } from './widgets';

export interface ConfirmOpts {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
  /** Action to run on confirm; thrown errors are shown inline, keeping the dialog open. */
  onConfirm?: () => void | Promise<void>;
}

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    document.querySelector('.lx-confirm-backdrop')?.remove();

    const el = node(html`
      <div class="lx-modal-backdrop lx-confirm-backdrop">
        <div class="lx-modal lx-confirm" role="dialog" aria-modal="true">
          <div class="lx-modal-head">${opts.title}</div>
          <div class="lx-modal-body"><p>${opts.message}</p><div class="lx-modal-err" hidden></div></div>
          <div class="lx-modal-foot"></div>
        </div>
      </div>`);
    const foot = el.querySelector('.lx-modal-foot') as HTMLElement;
    const errEl = el.querySelector('.lx-modal-err') as HTMLElement;

    let done = false;
    const finish = (result: boolean) => {
      if (done) return;
      done = true;
      el.remove();
      window.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(false); };

    const cancelBtn = button({ label: opts.cancelLabel ?? 'Cancel', variant: 'ghost', onClick: () => finish(false) });
    const confirmBtn = button({
      label: opts.confirmLabel ?? 'Confirm',
      variant: opts.danger ? 'danger' : 'primary',
      onClick: async () => {
        if (!opts.onConfirm) return finish(true);
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        errEl.hidden = true;
        try {
          await opts.onConfirm();
          finish(true);
        } catch (err) {
          errEl.textContent = String((err as Error)?.message ?? err).replace(/^Error:\s*/, '');
          errEl.hidden = false;
          confirmBtn.disabled = false;
          cancelBtn.disabled = false;
        }
      },
    });
    foot.append(cancelBtn, confirmBtn);

    el.addEventListener('click', (e) => { if (e.target === el) finish(false); });
    window.addEventListener('keydown', onKey);
    document.body.appendChild(el);
    confirmBtn.focus();
  });
}
