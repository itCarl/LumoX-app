// App context — the single engine / show / bank instances shared across the IPC
// handler modules and services, plus a few tiny pure helpers (group colour,
// fixture-config identity). The main process has exactly one of each, so these are
// module singletons rather than a passed-around object.
//
// This module is intentionally a LEAF: it imports only the engine (`src/`) and
// holds no orchestration. The domain logic that used to live here is split into
// focused services that import these singletons one-directionally:
//   services/FixtureMaps          limits + virtual-dimmer address maps
//   services/SelectionService     the live ordered "programming target"
//   services/SceneCompiler        Scene (show model) → SceneMixer track
//   services/SceneOrchestrator    recall / release-protect / loop / track rebuild
//   services/OutputPatchService   per-universe output patch + broadcast gating
//   services/showRuntime          per-tick wiring (composes the above at boot)

import { Engine, Show, BankManager, DiscoveryService } from '../src/index';
import type { Fixture } from '../src/index';

export const engine = new Engine({ refreshHz: 44 });
export const show = new Show({ name: 'Untitled' });
export const banks = new BankManager();

// Network node discovery (Art-Net ArtPoll). Runtime-only — started/stopped by the
// Connection tab while it's visible; never persisted. See main/handlers/discovery.ts.
export const discovery = new DiscoveryService();

// Group palette — each new group gets a distinct colour; its fixtures inherit it.
const GROUP_COLORS = [
  '#e0564b', '#e08a3b', '#e0c44b', '#8ec44b', '#4bc49a',
  '#4ba6e0', '#6b7ce0', '#9c5be0', '#e04bb0', '#5bd0e0',
];
let colorCursor = 0;
export const nextColor = (): string => GROUP_COLORS[colorCursor++ % GROUP_COLORS.length];

// Channel-config identity — fixtures with the same definition + mode share a
// layout and may be grouped together; different configs may not.
export const configKey = (fx: Fixture): string => `${fx.definition.id}::${fx.mode.id}`;

/** Do all fixture ids share one channel-config? (group membership constraint) */
export function sameConfig(ids: string[]): boolean {
  const keys = new Set<string>();
  for (const id of ids) {
    const f = show.patch.get(id);
    if (f) keys.add(configKey(f));
  }
  return keys.size <= 1;
}
