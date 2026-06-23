# Plan — Feature arming (multi-feature value-driving FX, Daslight-style)

> Forward-looking plan (not yet built). Goal: a value-driving FX layer (CURVE /
> VALUE / CHASER) drives **multiple armed features**, each with its own output
> **range**, armed by clicking an **FX badge** on the fader panel — the faithful
> Daslight model (see `docs/research/daslight5-scene-fx-fader-deep.md` §D).
> Today each such layer drives ONE `attr` with a single min/max.

## Data model (breaks the persisted FX format — no back-compat, per rule #2)

New shared type in `src/show/Scene.ts`:
```ts
export interface FxFeature { attr: string; min: number; max: number; }  // min=bg/off, max=level/on
```
Replace the single-attr fields with a `features: FxFeature[]`:
- `CurveFxConfig`: drop `attr, min, max` → add `features`. Keep `waveform, duty, invert`.
- `ValueFxConfig`: drop `attr, min, max` → add `features`. Keep `waveform, duty, invert, staticValue`.
- `ChaserFxConfig`: drop `attr, level, bg` → add `features` (per-feature `min`=bg, `max`=level). Keep `litCount, gap, fade`.
- Defaults seed `features: [{ attr: 'intensity', min: 0, max: 255 }]` so a freshly-added layer behaves like today.
- Update `defaultFxLayer`, `normalizeLayer`, `toTrackLayer` (copy `features`).

## Compiler (`main/services/SceneCompiler.ts`)
`targetsForKind` for curve/value/chaser must build, **per beam (fixture)**, a tuple
aligned to `features`: `tuple = features.map(f => fx.addressOf(f.attr) || 0)` (with
the existing `intensity → intensity-master` fallback per feature; `0` = fixture
lacks that attr → renderer skips it). Keep `beamIds` per fixture for the preview.
Decide the virtual-dimmer fan-out: only when a single `intensity` feature is armed
(preserve today's RGB-bar behaviour); skip vdim fan-out for multi-feature (documented limitation).

## Renderers (`src/mix/sceneFx.ts`)
- `renderWaveFx(buf, targets, now, period, spread, { waveform, duty, invert, staticValue, features })`:
  per beam `i` compute the wave `w` once (phase by `i`); then for each feature `j`
  with `targets[i][j] > 0`: `buf[addr-1] = clamp8(features[j].min + (features[j].max-features[j].min)*w)`.
- `renderChaserFx(...)`: per beam compute `k` once; write each feature `j` as
  `min_j + (max_j-min_j)*k`.
- `applyLayer` in `SceneMixer.ts`: pass `L.curve/value/chaser.features` through.

## IPC + serialization
- `main/handlers/scenes.ts`: `scenes:armFeature {id, layerId, attr}` (append default
  feature if absent + rebuild track), `scenes:unarmFeature {id, layerId, attr}`,
  `scenes:setFeatureRange {id, layerId, attr, min, max}`. Reuse `rebuildSceneTrack`.
- `main/dto.ts` + `serializers.ts`: expose `features` on the FX layer DTO.
- `preload.ts` + `renderer/lumox.d.ts`: the three new calls.

## Cross-panel UI — the FX badge (the hard part)
- **Arming target broadcast:** when the Scene panel (`fxpalette.ts`) expands a
  curve/value/chaser layer, emit a bus event `EV.FX_ARM = { sceneId, layerId, kind,
  armed: string[] }` (the armed attr ids); emit `null` when collapsed / non-armable.
- **Fader panel (`fadereditor.ts`):** when an `FX_ARM` target is active, render a
  small **FX badge** on each feature control / channel strip (per `attr`/group),
  lit when that attr is in `armed`. Click → `armFeature`/`unarmFeature` on the
  target layer; refresh. (Badge is independent of the engage dot.)
- **FX layer editor (`fxpalette.ts`):** replace the single `attr` select with a
  **Features list** — one row per armed feature: name + a **range slider** (min/max
  handles) + remove `×`; plus a hint "arm features from the fader panel". Drives
  `setFeatureRange` / `unarmFeature`.

## Persistence / demo
Breaking change: regenerate any demo-show scene that used a curve/value/chaser FX
(grep `demo-show-1.lmx` for those layer kinds; most movement scenes are static/chase
base, so impact is likely small).

## Tests + docs
- Unit: a curve FX with two features (e.g. dimmer 0–255 + a beam attr 50–200) writes
  both addresses with their own ranges from one waveform; chaser per-feature on/off.
- Docs: `mix-engine.md` (FX section), `app.md` (Scene-panel FX editor + fader badge),
  a short note in `htp-ltp.md` is not needed; update `busking.md` if it cites single-attr FX.

## Build order (each step compiles; commit only when the whole chain is green)
1. Model (Scene.ts) + defaults/normalize/toTrackLayer.
2. Compiler targetsForKind (per-feature tuples).
3. Renderers + applyLayer.
4. Serializers/DTO + IPC + preload/d.ts.
5. FX layer editor Features list (in-panel arming first — gives a working vertical slice).
6. Fader-panel FX badges + FX_ARM broadcast (the cross-panel gesture).
7. Demo regen, unit tests, docs, app verification (shot harness).
