// Settings modal — application preferences (language, appearance,
// autosave/startup). DMX output transport lives in the Connection tab
// (views/connection.ts). Opened from the ⋯ app menu. Reads/writes via
// `lumox.settings.*`; the main process persists to settings.json and broadcasts
// `settings:changed`, which lib/settings.ts applies to the document live.

import { node, html } from '../lib/dom';
import { input, button } from '../lib/widgets';
import type { AppSettings, AppLanguage } from '../lumox.d';

const { lumox } = window;

const ACCENTS = ['#5eb3ff', '#4bc49a', '#4bc46a', '#e0c44b', '#e0843b', '#e0564b', '#e34b8a', '#c44be0'];

/** A <select> bound to onChange, with the active value preselected. */
function selectEl(options: { value: string; label: string }[], value: string, onChange: (v: string) => void): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'lx-select';
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value; opt.textContent = o.label;
    if (o.value === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

/** A labelled form row: label on the left, control on the right, optional hint. */
function row(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const el = node(html`<div class="lx-form-row"><label>${label}</label><div class="lx-form-ctl"></div></div>`);
  const ctl = el.querySelector('.lx-form-ctl') as HTMLElement;
  ctl.appendChild(control);
  if (hint) ctl.appendChild(node(html`<div class="lx-form-hint">${hint}</div>`));
  return el;
}

function section(title: string, rows: HTMLElement[]): HTMLElement {
  const el = node(html`<div class="lx-form-section"><div class="lx-form-head">${title}</div></div>`);
  for (const r of rows) el.appendChild(r);
  return el;
}

export async function openSettingsModal(): Promise<void> {
  document.querySelector('.lx-modal-backdrop')?.remove();
  let s: AppSettings;
  try { s = await lumox.settings.get(); } catch { return; }

  // Persist a patch; merge the authoritative result back into local state.
  const save = (patch: Partial<AppSettings>) => { lumox.settings.update(patch).then((next) => { s = next; }).catch(() => {}); };

  // ---- Appearance: accent swatches + custom colour ----
  const swatches = node(html`<div class="lx-swatches"></div>`);
  ACCENTS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'lx-swatch' + (c.toLowerCase() === s.accent.toLowerCase() ? ' active' : '');
    b.style.background = c; b.title = c;
    b.addEventListener('click', () => {
      swatches.querySelectorAll('.lx-swatch').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      save({ accent: c });
    });
    swatches.appendChild(b);
  });
  const custom = node(html`<input type="color" class="lx-color" value="${s.accent}" title="Custom accent">`) as HTMLInputElement;
  custom.addEventListener('input', () => {
    swatches.querySelectorAll('.lx-swatch').forEach((x) => x.classList.remove('active'));
    save({ accent: custom.value });
  });
  const accentCtl = node(html`<div class="lx-accent"></div>`);
  accentCtl.append(swatches, custom);

  const body = node(html`<div class="lx-form"></div>`);
  body.append(
    section('General', [
      row('Language',
        selectEl([{ value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }], s.language, (v) => save({ language: v as AppLanguage })),
        'Applied now; full text translation is staged.'),
    ]),
    section('Appearance', [
      row('Accent colour', accentCtl),
    ]),
    section('Project', [
      row('Autosave',
        input({ type: 'number', value: String(s.autosaveMinutes), className: 'lx-num', onChange: (v) => save({ autosaveMinutes: Number(v) }) }),
        'Minutes between autosaves of a named project (0 = off).'),
      row('On launch',
        (() => {
          const lbl = node(html`<label class="lx-check"><input type="checkbox"> Reopen last project</label>`);
          const cb = lbl.querySelector('input') as HTMLInputElement;
          cb.checked = s.reopenLastProject;
          cb.addEventListener('change', () => save({ reopenLastProject: cb.checked }));
          return lbl;
        })()),
    ]),
  );

  const el = node(html`
    <div class="lx-modal-backdrop">
      <div class="lx-modal" role="dialog" aria-modal="true">
        <div class="lx-modal-head">Settings</div>
        <div class="lx-modal-body"></div>
        <div class="lx-modal-foot"></div>
      </div>
    </div>`);
  (el.querySelector('.lx-modal-body') as HTMLElement).appendChild(body);
  (el.querySelector('.lx-modal-foot') as HTMLElement).appendChild(button({ label: 'Done', variant: 'primary', onClick: () => close() }));

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  const close = () => { el.remove(); window.removeEventListener('keydown', onKey); };
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  window.addEventListener('keydown', onKey);
  document.body.appendChild(el);
}
