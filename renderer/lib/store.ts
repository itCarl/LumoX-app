// store.ts — shared reactive renderer state (single source of truth per value).
//
// Values here are read across multiple dock tiles. Instead of each tile keeping
// its own copy and re-syncing via a bus event, the owning tile writes the
// signal and every consumer reads it inside an effect() — fine-grained
// reactivity from @preact/signals-core (read/write via `.value`).

import { signal } from '@preact/signals-core';

/** Active fixture-group filter shared by the group bar, patch grid, stage and
 *  fader editor. `'all'` means no filter; otherwise a group id. */
export const activeGroup = signal<string>('all');
