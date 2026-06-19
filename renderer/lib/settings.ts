// Renderer-side application of app preferences. The main process owns the store
// (SettingsService); this just reflects the parts that affect the DOM — language
// (`<html lang>`) and accent colour (`--accent`, which the whole theme reads) —
// and re-applies them when settings change. Shared by every renderer window.

import type { AppSettings } from '../lumox.d';

const { lumox } = window;

/** Reflect settings onto the document (idempotent — safe to call repeatedly). */
export function applyAppSettings(s: AppSettings): void {
  document.documentElement.lang = s.language;
  document.documentElement.style.setProperty('--accent', s.accent);
}

/**
 * Fetch the current settings, apply them, and keep applying on change. Returns
 * the initial settings so callers can seed their own UI. Call once per window.
 */
export async function initAppSettings(): Promise<AppSettings | null> {
  lumox?.settings?.onChanged(applyAppSettings);
  try {
    const s = await lumox.settings.get();
    applyAppSettings(s);
    return s;
  } catch {
    return null;
  }
}
