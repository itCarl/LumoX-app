// Dev eval bridge — main-process introspection for development only. Lets a
// driver/devtools run a snippet against the live engine/show singletons (which
// the renderer's `window.lumox.*` IPC can't reach) and read a curated state
// snapshot. The screenshot harness uses it via `ctx.dev(code)`.
//
// SECURITY: registered ONLY when LUMOX_DEV=1. Off by default, never in a
// packaged build — this is a deliberate arbitrary-code surface (see security.md).
// The `npm run shot` wrapper sets LUMOX_DEV=1 for screenshot runs.

import { ipcMain } from 'electron';
import { engine, show, banks } from '../context';
import { getSelection } from '../services/SelectionService';
import { programmerSummary } from '../services/OutputPatchService';

export const DEV_BRIDGE_ENABLED = process.env.LUMOX_DEV === '1';

/** Reduce any value to something IPC + JSON can carry (drops functions, expands
 *  typed arrays, survives cycles) so an eval result never crashes the channel. */
function safe(value: unknown): unknown {
  const seen = new WeakSet<object>();
  return JSON.parse(JSON.stringify(value, (_k, v) => {
    if (typeof v === 'bigint') return Number(v);
    if (v instanceof Uint8Array) return Array.from(v);
    if (v instanceof Map) return Object.fromEntries(v);
    if (v instanceof Set) return [...v];
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[circular]';
      seen.add(v);
    }
    return v;
  }) ?? null);
}

/** Curated snapshot — the things worth glancing at without writing a snippet. */
function snapshot(): unknown {
  return {
    scenes: show.listScenes().length,
    liveScenes: show.listScenes().filter((s) => engine.scenes.isLive(s.id)).map((s) => s.name),
    patch: show.patch.list().length,
    groups: show.groups.list().length,
    banks: banks.list().length,
    selection: getSelection(),
    programmer: programmerSummary(),
    universes: engine.universes.list().map((u) => ({
      id: u.id, name: u.name, nonZero: u.data.reduce((n, b) => n + (b ? 1 : 0), 0),
    })),
  };
}

export function registerDevHandlers(): void {
  if (!DEV_BRIDGE_ENABLED) return;
  console.warn('[dev] eval bridge ENABLED (LUMOX_DEV=1) — never ship this in a packaged build');

  // Run `code` as an async body with engine/show/banks in scope; return its
  // (serialized) value. Throws propagate to the caller as a rejected invoke.
  ipcMain.handle('lumox:dev:eval', async (_e, code: string) => {
    const fn = new Function('engine', 'show', 'banks', `return (async () => { ${code} })();`);
    return safe(await fn(engine, show, banks));
  });

  ipcMain.handle('lumox:dev:state', () => snapshot());
}
