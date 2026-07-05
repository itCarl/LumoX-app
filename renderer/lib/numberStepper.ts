// Custom number-input steppers — replaces the browser's native spin arrows (which
// can't be themed) with on-theme ▲▼ buttons revealed on hover/focus, plus
// wheel-to-step and press-and-hold repeat.
//
// Global & re-render-safe: a MutationObserver wraps any `input[type=number]` that
// appears. The wrapper is transparent to the views — the input keeps its classes,
// value, and event listeners, so existing `querySelector('.foo')` and change
// handlers keep working; the steppers are absolutely positioned (no width change).

function step(input: HTMLInputElement, dir: number): void {
  if (input.disabled || input.readOnly) return;
  try { if (dir > 0) input.stepUp(); else input.stepDown(); } catch { /* non-numeric value */ }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function wrap(input: HTMLInputElement): void {
  if (input.dataset.num) return;
  input.dataset.num = '1';

  const w = document.createElement('span');
  w.className = 'numwrap';
  input.replaceWith(w);
  w.appendChild(input);

  const steps = document.createElement('span');
  steps.className = 'numwrap-steps';
  steps.innerHTML =
    '<button type="button" tabindex="-1" class="numwrap-up"><i class="fa-solid fa-chevron-up"></i></button>' +
    '<button type="button" tabindex="-1" class="numwrap-dn"><i class="fa-solid fa-chevron-down"></i></button>';
  w.appendChild(steps);

  // Press-and-hold to repeat; keep the input focused (mousedown preventDefault).
  const bind = (sel: string, dir: number) => {
    const btn = steps.querySelector(sel) as HTMLButtonElement;
    let to: ReturnType<typeof setTimeout>, iv: ReturnType<typeof setInterval>;
    const stop = () => { clearTimeout(to); clearInterval(iv); };
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      step(input, dir);
      to = setTimeout(() => { iv = setInterval(() => step(input, dir), 60); }, 320);
    });
    btn.addEventListener('mouseup', stop);
    btn.addEventListener('mouseleave', stop);
  };
  bind('.numwrap-up', 1);
  bind('.numwrap-dn', -1);

  // Wheel over the field steps it (only when hovered/focused, so page scroll is unaffected).
  input.addEventListener('wheel', (e) => {
    if (document.activeElement !== input && !w.matches(':hover')) return;
    e.preventDefault();
    step(input, e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
}

function scan(root: ParentNode): void {
  root.querySelectorAll?.('input[type="number"]:not([data-num])').forEach((el) => wrap(el as HTMLInputElement));
}

let started = false;
/** Wrap every number input (now + as they appear) with custom steppers. Idempotent. */
export function initNumberSteppers(): void {
  if (started) return;
  started = true;
  scan(document);
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (!(n instanceof HTMLElement)) continue;
      if (n.matches('input[type="number"]')) wrap(n as HTMLInputElement);
      else scan(n);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
