// Generic dialog window — a small frameless window (own taskbar entry) that
// renders a button prompt / notice from a spec fetched from main, and reports
// the clicked button id back. Replaces the app's former in-app modals.
// The window's X reports nothing; main treats a plain close as the cancel id.

import { html, mount } from './lib/dom';
import { esc } from './lib/html';

const { lumox } = window;

interface DialogButton { id: string; label: string; variant?: 'default' | 'primary' | 'danger'; }
interface DialogSpec { title: string; message: string; detail?: string; list?: string[]; buttons: DialogButton[]; cancelId: string; }

const titleEl = document.getElementById('dlg-title') as HTMLElement;
const root = mount(document.getElementById('dlg-root') as HTMLElement);

(document.getElementById('ew-close') as HTMLElement).addEventListener('click', () => lumox.win.closeSelf());

let answered = false;
function answer(id: string) {
  if (answered) return;
  answered = true;
  void lumox.dialog.resolve(id);   // main closes the window after recording the choice
}

function btnClass(v?: string) {
  return v === 'primary' ? 'lx-btn lx-btn-primary' : v === 'danger' ? 'lx-btn lx-btn-danger' : 'lx-btn lx-btn-ghost';
}

function render(spec: DialogSpec) {
  titleEl.textContent = spec.title;
  document.title = spec.title;
  root.set(html`
    <div class="dlg-content">
      <p class="dlg-msg">${spec.message}</p>
      ${spec.detail ? html`<p class="dlg-detail">${spec.detail}</p>` : ''}
      ${spec.list?.length
        ? html`<ul class="dlg-list">${spec.list.map((line) => html`<li>${line}</li>`)}</ul>`
        : ''}
    </div>
    <div class="dlg-foot" id="dlg-foot"></div>`);

  const foot = document.getElementById('dlg-foot') as HTMLElement;
  foot.innerHTML = spec.buttons
    .map((b) => `<button class="${btnClass(b.variant)}" data-id="${esc(b.id)}">${esc(b.label)}</button>`)
    .join('');
  foot.querySelectorAll<HTMLElement>('button[data-id]').forEach((b) =>
    b.addEventListener('click', () => answer(b.dataset.id as string)));

  // Primary button (or the last) is the Enter default; Esc cancels via the X path.
  const primary = foot.querySelector('.lx-btn-primary') ?? foot.querySelector('button:last-child');
  (primary as HTMLElement | null)?.focus();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); (primary as HTMLElement | null)?.click(); }
    else if (e.key === 'Escape') { e.preventDefault(); lumox.win.closeSelf(); }
  });
}

lumox.dialog.spec().then((spec: DialogSpec | null) => {
  if (spec) render(spec);
  else lumox.win.closeSelf();
}).catch(() => lumox.win.closeSelf());
