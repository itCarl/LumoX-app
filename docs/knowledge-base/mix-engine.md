# State & Mix Engine

**Status:** stable
**Files:** `src/core/Engine.ts`, `src/core/Universe.ts`, `src/mix/*`, `src/show/*`

## What

The headless engine composes the final DMX frame for every universe each tick.
It is the core of the app and runs with or without the Electron shell.

## How

- **Tick loop** (`src/core/Engine.ts`) runs at `refreshHz` (default **44**). Per
  tick, per universe:
  1. `mix.process(universe, ctx)` runs the pipeline → writes `universe.data`
  2. dirty check vs `_prev`
  3. `outputs.dispatch(universe, now)` — outputs gate on dirty / keepalive / rate
- **Mix pipeline** (`src/mix/MixPipeline.ts`), order matters:
  `BaseLayer → SceneMixer → Effects → GroupEffects → GrandMaster → Blackout`.
  Add/remove modules at runtime via `engine.mix.add/remove`; convenience refs
  `engine.scenes`, `engine.effects`, `engine.groupEffects`, `engine.grandMaster`,
  `engine.blackout`.
- **Universe buffers** (`src/core/Universe.ts`):
  - `programmer` — user/base writes (`setChannel`, IPC) land here
  - `data` — final mixed output the pipeline writes; outputs read this
  - `_prev` — last-sent snapshot for dirty detection

  512 channels, 1-indexed in the `setChannel`/`getChannel` API.
- **Show model** (`src/show/`): `Show`, `Patch`, `Scene`, `Group` + `GroupManager`,
  and `BankManager` (banks of scenes). New mix behaviour = subclass `MixModule`
  and implement `process(universe, ctx)`.

## Scene base + FX rack (`Scene.type` + `Scene.layers`)

A scene is a **base look** plus an ordered **FX rack** of effect layers composited
over it (bottom→top, top layer wins on a conflicting channel). There is **no
legacy single-FX-type path** — all effects are layers.

- **base** — `type: 'static'` (the captured `values` look) or `'chase'` (an ordered
  list of `ChaseStep`s `{ values, fadeMs, waitMs }`: a free-run chase crossfades in
  over `fadeMs` then dwells `waitMs`, cycle = sum across steps; BPM-drive steps
  uniformly with no crossfade; direction fwd/back/bounce reorders play).
- **rack** — `Scene.layers: FxLayer[]`. Each layer has a `kind`
  (`color`/`move`/`curve`/`chaser`/`value`/`matrix`), `enabled`, a `target`
  (`all` | `{group}`), an `order` (`patch`/`reverse`/`mirror`/`random` — the
  per-fixture sweep "index"), its own timing (`rateMs`/`speed`/`driveMode`/`beatDiv`/
  `direction`/`size`/`spread`) and one kind config. The SceneMixer composites the
  base + each enabled layer per tick, each layer on its **own phase clock**
  (`src/mix/sceneFx.ts` holds the FX math; `SceneMixer._frame` composites).

Layer kinds (`src/mix/sceneFx.ts`):

- **color** (`renderColorFx`) — gradient travelling the rig. Empty palette ⇒
  rainbow. `ColorFxConfig`: `palette[]`, `grayscale`, `colorWidth`, `angle`,
  `saturation`, `fade` (stop softness), `randomize`.
- **move** (`renderMoveFx`) — pan/tilt path (`shape`: circle/figure8/line/square),
  `symmetry`, `sizeX`/`sizeY`, `centerX`/`centerY`, `phaseShape` (path rotation).
- **curve** / **value** (`renderWaveFx`) — a waveform (sine/triangle/sawtooth/
  square/random) on **any attribute** (`attr` = channel-type id) mapped into
  `[min,max]`, with `duty` + `invert`; value also has a flat `staticValue`.
- **chaser** (`renderChaserFx`) — a lit window walking the selection: `litCount`,
  `gap`, `fade`, `level`/`bg`, on any `attr`.
- **matrix** (`renderMatrixFx`) — true **pixel-mapping**: colours each emitter
  from its 2D **world position** on the STAGE (not its sweep index). `pattern`
  (`wipe`/`radial`/`plasma`), `palette[]` (empty ⇒ rainbow), `saturation`, `fade`,
  `angle` (wipe direction), `scale` (cycles across the rig). Positions are
  normalized to the rig bounding box each tick, so the look fills the stage at any
  scale; rotating a fixture rotates its pixel-map. Drives per-emitter `[r,g,b]`
  channels — a single-colour fixture is one pixel, a matrix is one per cell. See
  [fixtures.md](fixtures.md) (stage transform + emitter world coordinates).

Each layer's DMX target addresses (`TrackLayer.targets`) are derived from the patch
by the app layer (`main/context.ts` `sceneTrack` → `fixturesFor`/`orderFixtures`/
`targetsForKind`, honouring the layer's group + order) and attached to the track —
the engine stays fixture-agnostic. MATRIX layers instead use `matrixTargets`,
which pairs each emitter's `[r,g,b]` tuple (`Fixture.emitterColorAddresses`) with
its world position (`Fixture.emitterWorldPositions`) into `TrackLayer.targets` +
`TrackLayer.positions`. Rebuild a track after editing with
`rebuildSceneTrack`. IPC: `scenes:setType`, `scenes:{add,remove,move}Step`,
`scenes:setStepTiming`, `scenes:{add,remove,move}Layer`,
`scenes:setLayer{Enabled,Target,Order,Timing,Config}`. Reusable colour palettes +
FX-rack presets persist with the project (`scenes:`… plus `palettes:*` / `presets:*`,
stored in `main/services/presets.ts`).

## Scene playback: fades, phase clock, tempo, transport

The CONTROL **Scene Properties** panel (`renderer/views/fxpalette.ts`) edits how a
scene plays. The runtime model lives in the `SceneMixer`:

- **Two clocks, one writer.** `process(universe, ctx)` runs once *per universe*
  per tick and is a pure reader (`opacity` + the track's phase). `update(deltaMs)`
  runs **once per tick** (wired in `main/context.ts` off the engine `'tick'`) and
  is the *only* writer of fade ramps and phase clocks — so multi-universe shows
  never double-advance. Direct/headless use without `update()` falls back to
  `ctx.now`, so existing examples animate unchanged.
- **Per-track `playback` state** (`SceneMixer.playback`): fade ramp
  (from/target/elapsed/total + a `preDelayMs`), a `phaseMs` virtual clock,
  `paused`, and a pinned `manualStep`. Created lazily on first fade/transport.
- **Fades.** `fadeTo(id, target, seconds, preDelayMs)` ramps opacity linearly;
  `seconds === 0` (and no pre-delay) settles instantly — preserving the original
  snap-recall for scenes with no fade. `recallScene` (context.ts) now crossfades:
  siblings fade to 0 over their `fadeOut`, the target fades to its DIMMER `level`
  over `fadeIn × fadeSpeed` after a `phaseIn` pre-delay. `isLive(id)` (opacity > 0
  **or** fading toward a positive target) drives broadcast gating; when a fade-out
  settles to 0, `consumeWentInactive()` triggers an `updateActiveUniverses()` so
  the universe stops transmitting.
- **Tempo.** `driveMode 'off'` → period `rateMs / speed`; `'bpm'` →
  `(60000 / bpm) / beatDiv`. The master `bpm` is owned by
  `main/services/Transport.ts`, pushed into the mixer, and persisted top-level.
- **Start mode** (on recall): `restart` zeroes the phase, `continue` keeps the
  free-running clock, `random` seeds an offset. **Direction**: `forward` /
  `backward` (reverse steps / negate FX angle) / `bounce` (triangle ping-pong).
- **Transport** (runtime only, not persisted): `pause/resume`, `stepNext/stepPrev`
  (chase: pin a step; FX: nudge the phase), `toStart/toEnd`.
- **Scene-timeline readout.** `SceneMixer.sceneTimeline(id)` returns the
  `{ cycleMs, phaseMs }` of whatever drives the *visible* motion: a chase uses its
  base clock; an FX scene uses the **first enabled layer's own clock + period**
  (critical — the base `phaseMs` does NOT advance for a `static`+FX scene; only
  layer clocks do, so reading the base clock would read a stuck 0). Bounce doubles
  the cycle for the out-and-back. Surfaced in `SceneDTO` (`cycleMs`/`phaseMs`); the
  Banks tile draws an **active-scene timeline** from them — a live `MMmSSsCC`
  timecode, a loop icon for periodic scenes, and a bottom playhead strip
  (`phaseMs % cycleMs`), interpolated at the display refresh rate (rAF) and
  re-anchored each poll. A plain static look falls back to its fade in+out time.

Scene scalar params (`level`, `speed`, `spread`, `size`, fade times, `driveMode`,
`beatDiv`, `startMode`, `direction`) persist with the project; the panel's setters
(`lumox:scenes:set*`) mutate the scene **and** the live track *in place* (not
`rebuildSceneTrack`) so the fade/phase state survives the edit.

## Advanced playback: priority, loop/jump, release/protect, flash

The CONTROL Scene panel's **Advanced** page (reached from the right-hand section
rail in `fxpalette.ts`) exposes a second set of playback rules. All persist with the project; setters are `lumox:scenes:set{Priority,
Loop,JumpTo,ReleaseAtEnd,ReleaseMode,Protect,Flash}`.

- **Priority** (`low`/`normal`/`high`). The `SceneMixer.process` composites by tier
  **high → low**: a tier "claims" every channel it writes (`_claimed` mask), and
  lower tiers can't touch claimed channels — so a high-priority scene overrides
  lower ones on shared fixtures. Within a tier, tracks blend as before (HTP/LTP by
  opacity). With all scenes at the default `normal`, one pass runs with nothing
  claimed — identical to a flat blend. Carried on the track (`track.priority`).
- **Loop / Jump** (`loop {mode:'always'|'count', count}`, `jumpTo`, `releaseAtEnd`).
  A counted loop runs N cycles then ends. The mixer counts in `update()`:
  `pb.runMs` accumulates live play time since recall (reset by `resetPhase`),
  and once `runMs ≥ count × sceneCycleMs(track)` the id is queued in `_completed`
  (drained by `consumeCompleted()`). `sceneCycleMs` = the chase's real-time cycle,
  else the first enabled FX layer's period (0 = nothing periodic → never completes).
  `context.ts handleLoopComplete` reacts: `jumpTo` (`next`/`prev` in bank, or a
  specific `sceneId`) recalls the target; otherwise `releaseAtEnd` releases the
  scene or pauses it on its last frame. `track.loopCount` (0 = forever) carries it.
- **Release / Protect** (`releaseMode` + `protectFromRelease`, each `off`/`all`/
  `bank`/`outside-bank`/`specific` with a bank-id list). `recallScene` releases
  every live scene its `releaseMode` covers **unless** that target shields itself
  via `protectFromRelease` against the actor's scope (`releases()` =
  `inReleaseScope(actor) && !isProtected(target)`). The defaults
  (`releaseMode:'bank'`, `protect:'off'`) reproduce the old "one active per bank".
- **Flash** (`flash`). The banks tile drives a flash scene from pointer-down
  (recall on) to pointer-up (recall off) instead of click-toggle.

## Banks

A bank is an ordered group of scenes — a container, not a sequencer. Scenes are
recalled individually; the column's `+` captures current output as a new scene in
that bank. Recall goes through `recallScene` (release/protect scopes + broadcast
refresh — default `bank` release keeps one active scene per bank), so recalling one
scene releases the others in its bank.

Right-clicking a bank tab (or a bank column header) opens a context menu to
**Rename…** or **Delete** the bank (`lumox:banks:rename` / `lumox:banks:remove`).
Deleting drops the bank's scenes from the engine + show; `ensureDefault()` recreates
an empty bank if the last one is removed.

## Recalling vs editing a scene (CONTROL → Banks)

A scene cell has two click regions with distinct, decoupled jobs:

- **Body** (wide left part) — activates / deactivates the scene (`recallScene`,
  toggle). Live playback only; it does not touch the edit target.
- **Right colour strip** — selects the scene as the fader editor's EDIT target
  (emits `SCENE_SELECTED`), without changing playback.

So playback and the edit selection are independent: fire a scene from the body,
pick what to edit with the strip.

## Fader editor — EDIT vs LIVE

The CONTROL fader editor writes to one of two targets:

- **EDIT** edits the recalled scene — `lumox:scenes:setChannel` maps a
  fixture-local channel to its absolute address and writes both `scene.values`
  and the live track (an active scene updates immediately). `null` clears the channel.
- **LIVE** engages channels in the universe `programmer` buffer (manual output).

### Engaged channels (the programmer)

The programmer carries two parallel buffers: the **values** (`Universe.programmer`)
and an **engaged mask** (`Universe.engaged`). Only channels you actually move are
*engaged*:

- A fader move calls `lumox:fixtures:setChannel` → `Universe.engage(abs, value)`
  (sets the value **and** the engaged flag for that one channel). Releasing a
  channel (its dot) calls `lumox:fixtures:releaseChannel` → `Universe.release(abs)`
  (zeroes it + clears the flag). Raw `setChannel`/`setRange`/`Fixture.apply` leave
  the mask untouched.
- This matters because `Fixture.apply` flushes a fixture's **default** channel
  values into the programmer at patch/load time (`handlers/patch.ts`,
  `ProjectService`). Those defaults are not engaged, so they are never captured or
  counted — only the faders you moved are.

### Programmer → Store (scene creation)

LIVE mode *is* the programmer — the staging buffer for building a look. Its header
shows the engaged-channel count plus three actions:

- **Clear** (`lumox:fixtures:clearProgrammer`) zeroes every universe's `programmer`
  buffer and engaged mask (`Universe.fillProgrammer`) and re-evaluates the broadcast
  subscription, so untouched channels stop transmitting.
- **Save** (`lumox:scenes:merge`, floppy-disk icon) overlays the engaged channels
  **into the current scene** — the one being edited (`SCENE_SELECTED`) — keeping the
  scene's other stored values. Distinct from `update`, which *replaces* the whole
  look. Disabled until a scene is active.
- **Snapshot** (`lumox:scenes:capture`, camera icon) snapshots the programmer into a
  **new** scene in the active bank. `Scene.snapshot({ engagedOnly: true })` captures
  **exactly the engaged channels** (even ones engaged at 0) — not fixture defaults,
  not whatever other scenes are live. Chase-step capture (`addStep`), re-capture
  (`update`) and merge (`merge`) use the same snapshot path. The Snapshot target is
  the active bank tab, broadcast over the renderer bus (`BANK_SELECTED`).

`lumox:fixtures:programmer` returns `{ channels, universes }` (counting the engaged
mask) for the header readout. Programmer state is transient (never flags the project
dirty). Headless/engine use without the flag still captures every non-zero channel —
`engagedOnly` is opt-in for the app.

## Broadcast gating

The shell's broadcast output (`main/context.ts`) subscribes only to "live"
universes — those with an active scene *or* live programmer output
(`markLiveUniverse`). With nothing live it uses the `NO_UNIVERSE` sentinel rather
than the empty "all" set.

**Release linger.** A universe that just stopped being live is **not** dropped
immediately — it lingers in the subscription for `RELEASE_LINGER_MS` (~1.2 s,
`tickReleaseLinger`). Without this the universe is unsubscribed the instant a scene
is released, *before* the mixed-down `0` frame is dispatched, so the nodes latch
their last value and the fixtures stay lit. The linger keeps it transmitting long
enough for the `0` (a dirty frame + a keep-alive) to reach the nodes, then drops
it. This makes "deselect a scene → fixtures go dark" work like a continuously-
outputting console; it also covers clearing the LIVE programmer.

**Shutdown blackout.** The same latching problem applies on quit: closing a socket
only *stops* transmission, leaving nodes on their last frame. So `shutdown()`
(`main/index.ts`) stops the tick first, then calls `blackoutAllOutputs()`
(`main/context.ts`) before `closeAll()`. That zeroes every universe and force-sends
a full 0 frame to its output via `Output.blackout()`, which **bypasses** the
subscription / dirty / rate-cap gating (an idle, gated-off universe would otherwise
never send the `0`). The frame is repeated a few times (`SHUTDOWN_BLACKOUT_FRAMES`,
spaced by `SHUTDOWN_BLACKOUT_SPACING_MS`) because the WiFi/UDP link is lossy. Runs on
every quit path (`before-quit`, `SIGINT`/`SIGTERM`).

## Notes / Gotchas

- Scenes are a mix layer (SceneMixer); effects / group-effects run after.
- SceneMixer blends scene-over-programmer **HTP** by default: a high LIVE value
  can mask a lower EDIT scene value on the same channel.
- New output type: subclass `Output`, set static `TYPE`, register via
  `OutputManager.registerType` (see `src/index.ts`).
- Best engine-API reference: `examples/`. See also [app.md](app.md).
