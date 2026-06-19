import { EventEmitter } from 'node:events';
import { UniverseManager } from './UniverseManager';
import { OutputManager } from '../outputs/OutputManager';
import { MixPipeline } from '../mix/MixPipeline';
import { BaseLayer } from '../mix/modules/BaseLayer';
import { SceneMixer } from '../mix/modules/SceneMixer';
import { Effects } from '../mix/modules/Effects';
import { GroupEffects } from '../mix/modules/GroupEffects';
import { Limits } from '../mix/modules/Limits';
import { GrandMaster } from '../mix/modules/GrandMaster';
import { Blackout } from '../mix/modules/Blackout';
import { createLogger } from '../util/logger';
import { buffersEqual } from '../mix/MixModule';
import type { MixContext } from '../mix/MixModule';

const log = createLogger('Engine');

export interface EngineOptions {
  refreshHz?: number;
  buildDefault?: boolean;
}

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
 *   BaseLayer → SceneMixer → Effects → GroupEffects → Limits → GrandMaster → Blackout
 * Add/remove modules at runtime via `engine.mix.add(...)`, `.remove(...)`, etc.
 *
 * Convenience refs created when default pipeline used:
 *   engine.scenes        SceneMixer instance
 *   engine.effects       Effects host instance (raw channel effects)
 *   engine.groupEffects  GroupEffects host (fixture-aware, needs Patch)
 *   engine.limits        Limits post-stage (per-fixture range/invert/swap/cap)
 *   engine.grandMaster   GrandMaster instance
 *   engine.blackout      Blackout instance
 */
export class Engine extends EventEmitter {
  refreshHz: number;
  tickIntervalMs: number;
  universes: UniverseManager;
  outputs: OutputManager;
  mix: MixPipeline;

  // Convenience refs. Set by the default pipeline (the common case); declared
  // with definite-assignment `!` so consumers don't null-guard. If constructed
  // with `buildDefault: false`, add the modules yourself before using these.
  scenes!: SceneMixer;
  effects!: Effects;
  groupEffects!: GroupEffects;
  limits!: Limits;
  grandMaster!: GrandMaster;
  blackout!: Blackout;

  _timer: ReturnType<typeof setInterval> | null;
  _lastTickAt: number;
  _frame: number;
  _running: boolean;
  // Reused across ticks — modules read it synchronously and must not retain it.
  _ctx: MixContext;

  constructor({ refreshHz = 44, buildDefault = true }: EngineOptions = {}) {
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
    this._ctx = { now: 0, deltaMs: 0, frame: 0 };
  }

  _buildDefaultPipeline(): void {
    this.mix.add(new BaseLayer());
    this.scenes       = this.mix.add(new SceneMixer());
    this.effects      = this.mix.add(new Effects());
    this.groupEffects = this.mix.add(new GroupEffects());
    this.limits       = this.mix.add(new Limits());
    this.grandMaster  = this.mix.add(new GrandMaster({ value: 1 }));
    this.blackout     = this.mix.add(new Blackout());
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._lastTickAt = performance.now();
    this._timer = setInterval(() => this._tick(), this.tickIntervalMs);
    log.info(`started @ ${this.refreshHz} Hz`);
    this.emit('started');
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    log.info('stopped');
    this.emit('stopped');
  }

  _tick(): void {
    const now = performance.now();
    const delta = now - this._lastTickAt;
    this._lastTickAt = now;
    this._frame++;
    const ctx = this._ctx;
    ctx.now = now;
    ctx.deltaMs = delta;
    ctx.frame = this._frame;

    for (const u of this.universes.list()) {
      this.mix.process(u, ctx);
      u.dirty = !buffersEqual(u.data, u._prev);
      if (u.dirty) u._prev.set(u.data);
      this.outputs.dispatch(u, now);
    }

    this.emit('tick', delta);
  }
}
