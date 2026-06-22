// widgets.ts — shared UI widgets so tiles stop hand-rolling the same buttons,
// inputs, and context menus. Four exports:
//
//   button(opts)        a styled <button> (variants map to .lx-btn* in Tailwind)
//   input(opts)         a styled <input> with onInput/onChange callbacks
//   toggle(opts)        the `.sp-toggle` pill switch as an HTML string — built
//                       for template composition + delegated routing (callers
//                       pass the data-attribute that routes their click handler).
//   openMenu(items,..)  the single context-menu / dropdown implementation that
//                       replaces the three near-identical copies the tiles had.
//
// Menus: only one is open at a time. A document-level click and Escape close
// the open menu, so callers no longer wire their own closeMenus() teardown.
// Open a menu from a *click* handler with stopPropagation() so the triggering
// click does not immediately close it (contextmenu triggers need no such care).

import { esc } from './html';

// ---- button -------------------------------------------------------------
export type BtnVariant = 'primary' | 'ghost' | 'danger' | 'icon';

export interface BtnOpts {
  label?: string;
  /** Trusted inline SVG / glyph markup, placed before the label. */
  icon?: string;
  variant?: BtnVariant;
  title?: string;
  disabled?: boolean;
  className?: string;
  dataset?: Record<string, string>;
  onClick?: (e: MouseEvent) => void;
}

export function button(o: BtnOpts): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = ['lx-btn', `lx-btn-${o.variant ?? 'ghost'}`, o.className]
    .filter(Boolean)
    .join(' ');
  if (o.title) b.title = o.title;
  if (o.disabled) b.disabled = true;
  b.innerHTML =
    (o.icon ? `<span class="lx-btn-ic">${o.icon}</span>` : '') +
    (o.label ? `<span>${esc(o.label)}</span>` : '');
  if (o.dataset) for (const [k, v] of Object.entries(o.dataset)) b.dataset[k] = v;
  if (o.onClick) b.addEventListener('click', o.onClick);
  return b;
}

// ---- input --------------------------------------------------------------
export interface InputOpts {
  value?: string;
  placeholder?: string;
  type?: string;
  title?: string;
  className?: string;
  onInput?: (value: string, e: Event) => void;
  onChange?: (value: string, e: Event) => void;
}

export function input(o: InputOpts): HTMLInputElement {
  const el = document.createElement('input');
  el.className = ['lx-input', o.className].filter(Boolean).join(' ');
  if (o.type) el.type = o.type;
  if (o.value != null) el.value = o.value;
  if (o.placeholder) el.placeholder = o.placeholder;
  if (o.title) el.title = o.title;
  if (o.onInput) el.addEventListener('input', (e) => o.onInput!(el.value, e));
  if (o.onChange) el.addEventListener('change', (e) => o.onChange!(el.value, e));
  return el;
}

// ---- toggle -------------------------------------------------------------
export interface ToggleOpts {
  /** On (true) / off (false) state. */
  on: boolean;
  /**
   * data-* attributes for delegated routing, without the `data-` prefix —
   * e.g. `{ cfgtoggle: field }` renders `data-cfgtoggle="…"`. The view binds
   * one delegated click handler matching that attribute.
   */
  dataset?: Record<string, string>;
  title?: string;
  className?: string;
}

/**
 * The pill toggle switch (`.sp-toggle`), returned as a trusted HTML string so it
 * drops into both html`` templates (wrap in raw()) and plain string concatenation.
 * It carries no own click handler — callers route via the data-attribute they pass.
 */
export function toggle(o: ToggleOpts): string {
  const cls = ['sp-toggle', o.on && 'on', o.className].filter(Boolean).join(' ');
  const ds = Object.entries(o.dataset ?? {})
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
  const title = o.title ? ` title="${esc(o.title)}"` : '';
  return `<button class="${cls}"${ds} role="switch" aria-checked="${o.on}"${title}><span class="sp-toggle-dot"></span></button>`;
}

// ---- menu ---------------------------------------------------------------
export type MenuItem =
  | { divider: true }
  | { header: string; color?: string }
  | { sub: string }
  | { swatches: string[]; onPick: (color: string) => void }
  | {
      label: string;
      /** Trusted inline markup before the label (icon/dot). */
      icon?: string;
      /** Coloured dot before the label (shortcut for a swatch icon). */
      dot?: string;
      /** Right-aligned shortcut hint, e.g. "Ctrl+R". */
      key?: string;
      /** Render a check column; true shows a tick. */
      check?: boolean;
      danger?: boolean;
      disabled?: boolean;
      title?: string;
      onClick?: () => void;
    };

export interface MenuOpts {
  /** Position at a cursor (clamped to the viewport). */
  at?: MouseEvent | { x: number; y: number };
  /** …or anchor under an element (e.g. a toolbar button). */
  anchor?: HTMLElement;
  /** Extra class on the menu element, e.g. 'scene-menu'. */
  className?: string;
}

let openEl: HTMLElement | null = null;

/** Close the currently open menu, if any. */
export function closeMenu(): void {
  openEl?.remove();
  openEl = null;
}

function itemHtml(it: MenuItem, i: number): string {
  if ('divider' in it) return '<div class="ctx-divider"></div>';
  if ('header' in it)
    return `<div class="ctx-head">${
      it.color ? `<span class="ctx-dot" style="background:${esc(it.color)}"></span>` : ''
    }${esc(it.header)}</div>`;
  if ('sub' in it) return `<div class="ctx-sub">${esc(it.sub)}</div>`;
  if ('swatches' in it)
    return `<div class="ctx-swatches" data-mi="${i}">${it.swatches
      .map((c) => `<button class="ctx-sw" data-color="${esc(c)}" style="background:${esc(c)}"></button>`)
      .join('')}</div>`;

  // button row
  let inner = '';
  if (it.check !== undefined) inner += `<span class="ctx-check">${it.check ? '<i class="fa-solid fa-check"></i>' : ''}</span>`;
  else if (it.dot) inner += `<span class="ctx-dot" style="background:${esc(it.dot)}"></span>`;
  else if (it.icon) inner += it.icon;
  inner += `<span>${esc(it.label)}</span>`;
  if (it.key) inner += `<span class="ctx-key">${esc(it.key)}</span>`;
  const cls = ['', it.danger && 'ctx-danger', it.disabled && 'ctx-disabled'].filter(Boolean).join(' ');
  return `<button class="${cls}" data-mi="${i}"${it.title ? ` title="${esc(it.title)}"` : ''}>${inner}</button>`;
}

/**
 * Open a context menu / dropdown. Returns the menu element. Positions either at
 * a cursor (`at`) or under an element (`anchor`), clamped to the viewport.
 */
export function openMenu(items: MenuItem[], opts: MenuOpts): HTMLElement {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = ['ctx-menu', opts.className].filter(Boolean).join(' ');
  menu.innerHTML = items.map(itemHtml).join('');
  document.body.appendChild(menu);

  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  if (opts.anchor) {
    const r = opts.anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(r.left, window.innerWidth - w - 8)}px`;
    menu.style.top = `${r.bottom + 2}px`;
  } else if (opts.at) {
    const x = 'clientX' in opts.at ? opts.at.clientX : opts.at.x;
    const y = 'clientX' in opts.at ? opts.at.clientY : opts.at.y;
    menu.style.left = `${Math.min(x, window.innerWidth - w - 8)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - h - 8)}px`;
  }

  items.forEach((it, i) => {
    if ('swatches' in it) {
      menu.querySelectorAll(`[data-mi="${i}"] .ctx-sw`).forEach((sw) =>
        sw.addEventListener('click', () => {
          closeMenu();
          it.onPick((sw as HTMLElement).dataset.color as string);
        }),
      );
    } else if ('label' in it && it.onClick && !it.disabled) {
      const btn = menu.querySelector(`[data-mi="${i}"]`) as HTMLElement | null;
      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        it.onClick!();
      });
    }
  });

  openEl = menu;
  return menu;
}

// one global teardown for every menu (replaces per-view document listeners)
document.addEventListener('click', () => closeMenu());
document.addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Escape') closeMenu();
});
