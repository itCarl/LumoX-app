// dom.ts — tiny render layer for the renderer. Two pieces that together remove
// the repeated `innerHTML = …` + `querySelectorAll().forEach(addEventListener)`
// churn the tiles used to carry:
//
//   html`…`    tagged template — interpolations are esc()'d by default, so
//              markup is XSS-safe without remembering to wrap each value.
//              Arrays are joined. Wrap trusted markup (icons, nested html``)
//              in raw() to inject it verbatim.
//   mount(el)  a view handle over a container: set() swaps innerHTML; on()
//              binds ONE *delegated* listener on the container, so handlers
//              survive every re-render — no re-attaching after each set().
//   node(c)    build a single detached element from html`` / a string.

import { esc } from './html';

const RAW = Symbol('raw');
export interface RawResult { [RAW]: true; s: string; }

/** Mark a string as trusted markup — injected without escaping. */
export function raw(s: string): RawResult {
  return { [RAW]: true, s };
}

/** Coerce any interpolated value to an HTML string (escaping untrusted text). */
function toStr(v: unknown): string {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(toStr).join('');
  if (typeof v === 'object' && (v as RawResult)[RAW]) return (v as RawResult).s;
  return esc(v);
}

/** Tagged template. Values are escaped unless wrapped in raw(); arrays joined. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): RawResult {
  let out = '';
  strings.forEach((chunk, i) => {
    out += chunk + (i < values.length ? toStr(values[i]) : '');
  });
  return { [RAW]: true, s: out };
}

export type Renderable = RawResult | string | number | null | undefined | Renderable[];

export interface View {
  readonly el: HTMLElement;
  /** Replace the container's contents. */
  set(content: Renderable): View;
  /** Empty the container. */
  clear(): View;
  /**
   * Delegated event binding — attached once to the container. The handler fires
   * when the event originates inside an element matching `selector`, receiving
   * that element. Survives set() because it never touches the children.
   */
  on(
    type: string,
    selector: string,
    handler: (e: Event, target: HTMLElement) => void,
  ): View;
}

/** Wrap a container element in a re-render-friendly view handle. */
export function mount(el: HTMLElement): View {
  const view: View = {
    el,
    set(content) {
      el.innerHTML = toStr(content);
      return view;
    },
    clear() {
      el.innerHTML = '';
      return view;
    },
    on(type, selector, handler) {
      el.addEventListener(type, (e) => {
        const start = e.target as Element | null;
        const target = start?.closest(selector) as HTMLElement | null;
        if (target && el.contains(target)) handler(e, target);
      });
      return view;
    },
  };
  return view;
}

/** Build a single detached element from html`` (or a string). */
export function node(content: Renderable): HTMLElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = toStr(content).trim();
  return tpl.content.firstElementChild as HTMLElement;
}
