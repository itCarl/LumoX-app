// Keyboard helpers — shared shortcut wiring for the renderer.

/** True while focus is in a text field — don't hijack typing for shortcuts. */
export function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export interface Combo { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; }

/**
 * Register a global keydown shortcut. It is ignored while typing in a field, or
 * when the optional `enabled()` guard returns false (e.g. the owning tile is
 * hidden or nothing is selected) — in that case the event is left untouched so
 * the default action (or another tile's handler) still applies. This lets
 * separate tiles bind the same key (Delete) without colliding, each scoped to
 * when it is actually on screen. Returns an unsubscribe fn.
 */
export function onShortcut(combo: Combo, run: () => void, enabled?: () => boolean): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== combo.key.toLowerCase()) return;
    if (!!combo.ctrl !== (e.ctrlKey || e.metaKey)) return;
    if (!!combo.shift !== e.shiftKey) return;
    if (!!combo.alt !== e.altKey) return;
    if (isEditable(e.target)) return;
    if (enabled && !enabled()) return;
    e.preventDefault();
    run();
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
