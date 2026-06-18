import { MixModule } from '../MixModule';
import type { MixModuleConfig, MixContext } from '../MixModule';
import type { Universe } from '../../core/Universe';

/**
 * BaseLayer — first stage. Copies `programmer` buffer into `data` so the
 * rest of the pipeline starts from a clean known state each tick.
 *
 * Without this, `data` would carry over the previous frame's mix and
 * downstream HTP modules would accumulate forever.
 */
export class BaseLayer extends MixModule {
  constructor(config: MixModuleConfig = {}) {
    super({ name: 'Base Layer', ...config });
  }

  process(universe: Universe, _ctx: MixContext): void {
    universe.data.set(universe.programmer);
  }
}
