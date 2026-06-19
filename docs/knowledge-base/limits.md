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
- **Per-channel flags** — `fade` (off ⇒ the channel **snaps** on scene crossfades
  instead of interpolating, e.g. gobo / colour-wheel slots) and `dimmer` (on ⇒ the
  channel's output **follows the fixture's dimmer**).

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
swap the pan/tilt output bytes → **follows-dimmer** scaling (each flagged channel
× the mixed dimmer ÷ 255).

**follows-fade (snap)** is the one limit applied earlier, in the mixer itself:
`SceneMixer` holds a per-universe snap mask (`setSnapMask`); a masked channel jumps
at the fade midpoint instead of scaling by opacity during scene crossfades.

## Authoring model + persistence

`Fixture.limits: FixtureLimits | null` (`src/fixtures/Fixture.ts`), in coarse DMX:

```ts
interface FixtureLimits {
  dimmer?: { max: number };
  pan?:  { min: number; max: number; invert?: boolean };
  tilt?: { min: number; max: number; invert?: boolean };
  swapPanTilt?: boolean;
}
// per-channel flags, keyed by 1-based local channel index:
type FixtureChannelFlags = { [channelIndex: number]: { fade?: boolean; dimmer?: boolean } };
```

Both `Fixture.limits` and `Fixture.channelFlags` persist via `Fixture.toJSON()`,
restore in `ProjectService.restoreProject`, and are surfaced to the renderer on
`FixtureDTO` (`serializers.ts`).

## App wiring

`main/context.ts` `rebuildLimits()` resolves the whole patch into both engine
modules: `buildLimitMap()` (limits + follows-dimmer addresses → `engine.limits`)
and `buildSnapMask()` (per-universe `fade:false` mask → `engine.scenes`). Call it
after any patch change (`handlers/patch.ts` move/remove), a limits/flag edit, or
project load.

## IPC — `lumox:fixtures:*` (dirties the project)

| Channel | Action |
| --- | --- |
| `:setLimits` (fixtureIds, patch) | merge a `FixtureLimits` patch into each fixture (a `null` key clears that limit), then `rebuildLimits` |
| `:clearLimits` (fixtureIds) | drop every limit on the given fixtures |
| `:setChannelFlag` (fixtureIds, channel, flag, value) | set/clear a `fade`/`dimmer` flag on a 1-based channel across the selection |

Preload: `lumox.fixtures.setLimits(ids, patch)` / `clearLimits(ids)` / `setChannelFlag(ids, channel, flag, value)`.

## UI — the Limits tile (SETUP, bottom-right)

`renderer/views/limits-tile.ts` is a dock tile in the SETUP tab's bottom-right slot
(where the fader editor sits in CONTROL). It edits the **live fixture selection**
(stage / patch grid via `EV.FIXTURE_SELECTED`), seeding from the first selected
fixture and writing to the whole selection. Every value is shown as a friendly
**0–100 %** (stored as DMX bytes). Sections, shown per capability:

- **Pan / tilt range** — a **2D box** whose inner rectangle is the allowed movement
  window (drag the edges) sat beside **editable min/max % fields** for each axis;
  per-axis **invert** buttons and a **swap pan / tilt** toggle.
- **Max brightness** — a horizontal **cap bar** plus a **% field**; **100 % = no cap**
  (clears the `dimmer` limit), anything lower stores a ceiling.
- **Channels** — a per-channel **Fade / Dim** pill list (Fade lit = crossfades; off =
  snaps. Dim lit = follows the dimmer; hidden on intensity channels).

Both the box/bar drags and the numeric fields drive the same edges, so you can set a
limit precisely or by feel. Edits write live through the IPC above (the engine applies
immediately; the History service coalesces a drag into one undo step). **Clear**
(header) drops all limits on the selection. Empty selection shows a prompt.
