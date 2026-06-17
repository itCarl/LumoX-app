import { MixModule } from '../MixModule.js';

/**
 * BaseLayer — first stage. Copies `programmer` buffer into `data` so the
 * rest of the pipeline starts from a clean known state each tick.
 *
 * Without this, `data` would carry over the previous frame's mix and
 * downstream HTP modules would accumulate forever.
 */
export class BaseLayer extends MixModule {
  constructor(config = {}) {
    super({ name: 'Base Layer', ...config });
  }

  process(universe, _ctx) {
    universe.data.set(universe.programmer);
  }
}
