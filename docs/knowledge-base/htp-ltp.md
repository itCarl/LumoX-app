# HTP / LTP — how scene channels combine

When more than one source drives the same DMX channel — two active scenes, a
scene plus the live programmer, a scene over a fixture's home default — the mixer
has to decide what value actually goes out. Lighting consoles answer this with two
rules, applied **per channel by what the channel does**:

- **HTP — Highest Takes Precedence.** The output is the **maximum** of all
  contributors. Used for **intensity / dimmer**: stacking two looks that each
  light a fixture should keep it lit at the brighter of the two, and dropping one
  must not darken what the other still holds.
- **LTP — Latest Takes Precedence.** The most recent source to drive the channel
  **replaces** it. Used for every **attribute** — pan, tilt, colour, gobo,
  beam, prism, control. There is no "brightest" pan; the look you called last is
  the position/colour you want, even if its numeric value is lower than what was
  there before.

This is the conventional model every busking console uses (see
[busking.md](busking.md) for why it matters live: intensity HTP lets you pile on
brightness, attribute LTP lets you re-colour / re-point without fighting). QLC+,
for reference, implements exactly this split (Intensity group → HTP, all other
`QLCChannel::Group`s → LTP).

## Why a flat HTP is wrong

Every moving head rests at a **home default** — pan/tilt centred at `128` — flushed
into the universe programmer at patch/load time (`Fixture.applyDefaults` →
`Fixture.apply`; see [mix-engine.md](mix-engine.md)). `BaseLayer` copies the
programmer into the frame each tick, so that `128` is the starting value the
SceneMixer blends over.

If scenes blended **HTP on every channel**, a scene that sets `tilt = 100` (below
the `128` home) would lose: `max(128, 100) = 128`. The head would never tilt below
centre — a movement scene that sweeps `100 → 0` would sit frozen at `128`. Pan to
`170` would work (`170 > 128`) while tilt to `100` silently wouldn't. That is the
class of bug this model fixes: **position/colour are LTP, so a scene replaces the
home default outright.**

## How Lumox implements it

The engine stays fixture-agnostic — it walks DMX addresses, it doesn't know what a
"tilt" is. So the **app classifies** channels and hands the SceneMixer the maps;
the mixer does the per-channel blend. Three pieces cooperate:

### 1. The LTP channel mask (which addresses are attributes)

`FixtureMaps.buildLtpMask` ([main/services/FixtureMaps.ts](../../main/services/FixtureMaps.ts))
walks the patch and builds, per universe, a `Uint8Array` where `1` marks an **LTP
(attribute)** address. A fixture's intensity / intensity-master channels
(`Fixture.intensityAddresses`) stay **HTP**; every other real channel — and the
fixture's virtual dimmers — is **LTP**. It is pushed to the engine via
`SceneMixer.setLtpMask` from `rebuildFixtureMaps`, alongside the limit and
virtual-dimmer maps, and rebuilt on every patch change.

A universe with **no mask** (headless / unit-test use) blends **HTP on every
channel** — the original default, so direct engine use is unchanged.

### 2. The per-track set mask (which channels a scene actually drives)

LTP "replace" needs to know which channels a scene drives — including ones it sets
to `0` (an explicit `tilt = 0` must override the home default, so "value is 0"
can't mean "untouched"). `Scene.toMixerTrack` builds a **footprint mask**
(`MixerTrack.setMask`): the union of the base look, every chase step, and — added
in `SceneCompiler.sceneTrack` — every enabled FX layer's target addresses. A
channel is "driven" iff it is in this footprint.

This mirrors how QLC+ avoids the same bug: each function only writes the channels
it owns, so untouched channels keep their prior value.

### 3. The blend itself

`blendTrack` ([src/mix/modules/SceneMixer.ts](../../src/mix/modules/SceneMixer.ts)),
called once per track per tier (high → low priority), decides per channel:

- **HTP** (`ltpMask` bit unset — intensity / unclassified): `dst = max(dst, src·opacity)`.
  A lower value never pulls a brighter contributor down; intensity's home default
  of `0` is the natural floor.
- **LTP** (`ltpMask` bit set — attribute): the track **replaces** the channel
  (crossfaded by `opacity`) **where it drives it** (`setMask`) — *except* a
  channel the live programmer is actively holding (`Universe.engaged`), which the
  manual layer owns and a scene must not stomp.

Priority tiers still gate everything: a higher-priority scene `claims` the
channels it writes so lower tiers can't touch them (see
[mix-engine.md](mix-engine.md) → priority). Within a tier, later-added tracks win
LTP channels (latest-takes-precedence by track order).

### Live (manual) precedence

The live programmer's **engaged** channels (faders you moved in the fader editor's
LIVE mode — `Universe.engage`) sit in the frame via `BaseLayer` and are **never
overridden by a scene's LTP write**. Home defaults are *not* engaged, so scenes do
override them — exactly the intended split. (QLC+ resolves the same precedence by
fader write-order + an `Override`/`forceLTP` flag; Lumox uses the engaged mask.)

### Crossfades

A dipless scene-to-scene crossfade (`startTransition`) lerps a frozen outgoing
look toward the incoming one. Its footprint is the **union** of both scenes'
set masks, so an attribute moving toward `0` still animates (LTP) instead of
snapping back to the home default. Channels full in both looks don't dip (the
crossfade is value-wise, not opacity-wise) — see [mix-engine.md](mix-engine.md) →
dipless crossfade.

## Faders mirror live movement

Because attributes are LTP, a recalled chase / movement scene drives its real
pan/tilt output as it plays. The fader editor's EDIT mode mirrors that: while the
edit scene is **live and periodic**, it polls the mixed output
(`lumox:scenes:monitor`) for the target fixtures and drives the strip positions
from it, so the faders visibly track the sweep. Static (or inactive) scenes keep
showing their editable stored values. See [selection.md](selection.md) /
[mix-engine.md](mix-engine.md).

## Quick reference

| Channel kind | Rule | Behaviour |
| --- | --- | --- |
| Intensity / dimmer / virtual-dimmer's master role | **HTP** | brightest contributor wins; home floor is 0 |
| Pan, tilt, colour, gobo, beam, prism, control… | **LTP** | last scene to drive it replaces it (even at 0) |
| Live-engaged programmer channel | — | manual control wins; scenes never override |
| Unclassified (no patch / headless) | **HTP** | flat default, unchanged engine behaviour |
