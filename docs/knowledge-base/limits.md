# Per-fixture output limits

Limits clamp / shape a fixture's **final** output safely, no matter which source
(scene / FX / live programmer) drove the channel — so a moving head can't be told
to point into the truss and a dimmer can't exceed a safe maximum.

Supported limits (all optional, per fixture):

- **Dimmer cap** — ceiling (0..255) on every intensity channel.
- **Pan / tilt range** — a coarse-DMX `{min, max}` window the axis's full motion is
  linearly **remapped** into (not clipped), plus **invert** (mirror the axis).
  16-bit aware when a fine channel exists. Because it's a post-mix remap, a MOVE-FX
  sweep stays smooth and the FX never rebuilds when the limit changes.
- **Swap pan / tilt** — route the pan output to the tilt channel and vice-versa
  (a wiring swap; applied after range/invert shape each axis).

## Engine — a post-mix stage

`Limits` (`src/mix/modules/Limits.ts`) runs in the pipeline **after** GroupEffects
and before GrandMaster:

```
BaseLayer → SceneMixer → Effects → GroupEffects → Limits → GrandMaster → Blackout
```

It is fixture-agnostic: it holds a per-universe map of fixtures resolved to
absolute DMX addresses (`LimitMap = Map<universeId, FixtureLimitTargets[]>`) and
walks it each tick, shaping `universe.data`. Per fixture, in order: dimmer cap
(ceiling clamp) → pan/tilt **range remap** + invert (the normalised 0..full input
is linearly mapped into `[min,max]`; ×257 bridges 0..255 ↔ the 16-bit value) →
swap the pan/tilt output bytes.

## Authoring model + persistence

`Fixture.limits: FixtureLimits | null` (`src/fixtures/Fixture.ts`), in coarse DMX:

```ts
interface FixtureLimits {
  dimmer?: { max: number };
  pan?:  { min: number; max: number; invert?: boolean };
  tilt?: { min: number; max: number; invert?: boolean };
  swapPanTilt?: boolean;
}
```

`Fixture.limits` persists via `Fixture.toJSON()`, restores in
`ProjectService.restoreProject`, and is surfaced to the renderer on `FixtureDTO`
(`serializers.ts`).

## App wiring

`main/services/FixtureMaps.ts` `rebuildLimits()` resolves the whole patch via `buildLimitMap()`
(each fixture's limits → absolute addresses → `engine.limits`). Call it after any
patch change (`handlers/patch.ts` move/remove), a limits edit, or project load.

## IPC — `lumox:fixtures:*` (dirties the project)

| Channel | Action |
| --- | --- |
| `:setLimits` (fixtureIds, patch) | merge a `FixtureLimits` patch into each fixture (a `null` key clears that limit), then `rebuildLimits` |
| `:clearLimits` (fixtureIds) | drop every limit on the given fixtures |

Preload: `lumox.fixtures.setLimits(ids, patch)` / `clearLimits(ids)`.

## UI — the Limits tile (SETUP, bottom-right)

`renderer/views/limits-tile.ts` is a dock tile in the SETUP tab's bottom-right slot
(where the fader editor sits in CONTROL). It edits the **live fixture selection**
(stage / patch grid via `EV.FIXTURE_SELECTED`), seeding from the first selected
fixture and writing to the whole selection. Limits are always stored as DMX bytes;
the read-outs differ by axis. Two side-by-side columns (`.lt-cols`): brightness |
movement, responsively laid out via a CSS size container (`.lt-body`).

- **Pan / tilt range** — a **2D crop box** (dashed allowed-window rectangle with
  corner + edge-midpoint grab handles and a centre crosshair), beside `PAN` / `TILT`
  blocks each holding **Min / Max** degree fields, plus **Invert** (per-axis) and
  **Swap pan / tilt** pill toggles. The degree scale comes from the fixture
  definition's physical travel (`physical.focus.panMax`/`tiltMax`, on `FixtureDTO` as
  `panMaxDeg`/`tiltMaxDeg`); when omitted it falls back to **540° pan / 270° tilt**. A
  coarse DMX byte maps linearly onto `0..max°`, so the stored `{min,max}` stays in
  bytes — degrees are display-only.
- **Max brightness** — a **vertical fader** plus a **0–100 % field**; **100 % = no
  cap** (clears the `dimmer` limit), lower stores a ceiling. Dimmer channels come from
  the channel type's `isIntensity` flag (`ChannelDTO.isIntensity`).

Box/fader drags and the numeric fields drive the same edges. Edits write live through
the IPC above (engine applies immediately; History coalesces a drag into one undo
step). **Clear** (header) drops all limits on the selection. Limits the current
selection can't apply are **greyed in place, never removed**, so the layout never
jumps (e.g. an LED bar greys the pan/tilt column; nothing selected greys both).
