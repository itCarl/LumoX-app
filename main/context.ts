// App context — the single engine/show/bank instances and the small domain
// helpers shared across IPC handler modules. The main process has exactly one
// of each, so these are module singletons rather than a passed-around object.

import { Engine, Show, BankManager } from '../src/index';
import type { Output, Fixture } from '../src/index';

export const engine = new Engine({ refreshHz: 44 });
export const show = new Show({ name: 'Untitled' });
export const banks = new BankManager();

// Sentinel universe id the broadcast output subscribes to when nothing is
// active — an empty subscription set would otherwise mean "all".
export const NO_UNIVERSE = -1;

// Broadcast output transmits only universes with an active scene. Created in
// bootShow(); reassigned when a project restore recreates it.
let broadcastOutput: Output | null = null;
export const getBroadcastOutput = (): Output | null => broadcastOutput;
export const setBroadcastOutput = (o: Output | null): void => { broadcastOutput = o; };

/** Recompute which universes the broadcast output sends (active scenes only). */
export function updateActiveUniverses(): void {
  if (!broadcastOutput) return;
  const set = new Set<number>();
  for (const s of show.listScenes()) {
    const t = engine.scenes.tracks.get(s.id);
    if (t && t.opacity > 0) for (const uid of Object.keys(s.values)) set.add(Number(uid));
  }
  broadcastOutput.subscribedUniverses = set.size ? set : new Set([NO_UNIVERSE]);
}

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
