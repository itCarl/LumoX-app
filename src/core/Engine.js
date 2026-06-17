import { EventEmitter } from 'node:events';
import { UniverseManager } from './UniverseManager.js';
import { OutputManager } from '../outputs/OutputManager.js';
import { MixPipeline } from '../mix/MixPipeline.js';
import { BaseLayer } from '../mix/modules/BaseLayer.js';
import { SceneMixer } from '../mix/modules/SceneMixer.js';
import { Effects } from '../mix/modules/Effects.js';
import { GroupEffects } from '../mix/modules/GroupEffects.js';
import { GrandMaster } from '../mix/modules/GrandMaster.js';
import { Blackout } from '../mix/modules/Blackout.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('Engine');

/**
 * Engine — tick loop with modular mix pipeline.
 *
 * Per-tick flow:
 *   1. for each universe:
 *        a. pipeline.process(universe, ctx)  → writes universe.data
 *        b. compare universe.data vs _prev   → set dirty
 *        c. outputs.dispatch(universe, now)  → outputs gate on dirty/keepalive
 *        d. copy data → _prev
 *
 * Default pipeline (constructable via `buildDefault: false` to skip):
 *   BaseLayer → SceneMixer → Effects → GroupEffects → GrandMaster → Blackout
 * Add/remove modules at runtime via `engine.mix.add(...)`, `.remove(...)`, etc.
 *
 * Convenience refs created when default pipeline used:
 *   engine.scenes        SceneMixer instance
 *   engine.effects       Effects host instance (raw channel effects)
 *   engine.groupEffects  GroupEffects host (fixture-aware, needs Patch)
 *   engine.grandMaster   GrandMaster instance
 *   engine.blackout      Blackout instance
 */
export class Engine extends EventEmitter {
  constructor({ refreshHz = 44, buildDefault = true } = {}) {
    super();
    this.refreshHz = refreshHz;
    this.tickIntervalMs = 1000 / refreshHz;
    this.universes = new UniverseManager();
    this.outputs = new OutputManager();
    this.mix = new MixPipeline();

    if (buildDefault) this._buildDefaultPipeline();

    this._timer = null;
    this._lastTickAt = 0;
    this._frame = 0;
    this._running = false;
  }

  _buildDefaultPipeline() {
    this.mix.add(new BaseLayer());
    this.scenes       = this.mix.add(new SceneMixer());
    this.effects      = this.mix.add(new Effects());
    this.groupEffects = this.mix.add(new GroupEffects());
    this.grandMaster  = this.mix.add(new GrandMaster({ value: 1 }));
    this.blackout     = this.mix.add(new Blackout());
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastTickAt = performance.now();
    this._timer = setInterval(() => this._tick(), this.tickIntervalMs);
    log.info(`started @ ${this.refreshHz} Hz`);
    this.emit('started');
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    clearInterval(this._timer);
    this._timer = null;
    log.info('stopped');
    this.emit('stopped');
  }

  _tick() {
    const now = performance.now();
    const delta = now - this._lastTickAt;
    this._lastTickAt = now;
    this._frame++;
    const ctx = { now, deltaMs: delta, frame: this._frame };

    for (const u of this.universes.list()) {
      this.mix.process(u, ctx);
      u.dirty = !buffersEqual(u.data, u._prev);
      if (u.dirty) u._prev.set(u.data);
      this.outputs.dispatch(u, now);
    }

    this.emit('tick', delta);
  }
}

function buffersEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
