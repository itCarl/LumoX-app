// Shared builders for the engine specs — small factories that assemble a
// FixtureDefinition / Fixture from a list of channel type ids, so each test can
// describe just the channel layout it cares about. Importing `src/index` first
// bootstraps the channel-type registry (built-in types self-register), which
// `ChannelDefinition` needs to accept a `typeId`.
import { FixtureDefinition, FixtureMode, Fixture } from '../../src/index';
import type { EmitterCell } from '../../src/index';

export interface DefOpts {
  manufacturer?: string;
  model?: string;
  type?: string;
  modeName?: string;
  emitters?: number;
  emitterLayout?: EmitterCell[] | null;
}

/** A FixtureDefinition with one mode whose channels are the given type ids
 *  (use `null` for an unused slot). */
export function makeDef(typeIds: (string | null)[], opts: DefOpts = {}): FixtureDefinition {
  const mode = new FixtureMode({
    name: opts.modeName ?? `${typeIds.length}ch`,
    channels: typeIds.map((t) => (t ? { typeId: t } : null)),
  });
  return new FixtureDefinition({
    manufacturer: opts.manufacturer ?? 'Test',
    model: opts.model ?? 'Generic',
    type: opts.type ?? 'PAR',
    emitters: opts.emitters,
    emitterLayout: opts.emitterLayout ?? null,
    modes: [mode],
  });
}

export interface FixtureOpts extends DefOpts {
  id?: string;
  universeId?: number;
  startAddress?: number;
}

/** A patched Fixture over a freshly built definition. */
export function makeFixture(typeIds: (string | null)[], opts: FixtureOpts = {}): Fixture {
  return new Fixture({
    definition: makeDef(typeIds, opts),
    id: opts.id,
    universeId: opts.universeId ?? 0,
    startAddress: opts.startAddress ?? 1,
  });
}
