// showRuntime — wires the per-tick scene runtime to the engine and connects the
// selection-change hook to the scene orchestrator. This is the seam that lets the
// services stay one-directional (no service imports another that imports it back):
// the orchestration modules expose their entry points, and this module composes
// them at boot. Call `wireShowRuntime()` once, before the engine starts ticking.

import { engine } from '../context';
import { updateActiveUniverses, tickReleaseLinger } from './OutputPatchService';
import { handleLoopComplete, rebuildSelectionTracks } from './SceneOrchestrator';
import { setSelectionChangeHandler } from './SelectionService';

export function wireShowRuntime(): void {
  // A selection change re-fans any live scene whose FX targets the selection.
  setSelectionChangeHandler(rebuildSelectionTracks);

  // Advance scene fades + phase clocks once per tick (the SceneMixer's per-universe
  // process() stays a pure reader). When a fade-out settles to 0 the scene stops
  // being "live", so drop it from the broadcast subscription; when a counted loop
  // finishes, hand it to the orchestrator (jump / release / pause).
  engine.on('tick', (deltaMs: number) => {
    engine.scenes.update(deltaMs);
    if (engine.scenes.consumeWentInactive().length) updateActiveUniverses();
    for (const id of engine.scenes.consumeCompleted()) handleLoopComplete(id);
    tickReleaseLinger(deltaMs);
  });
}
