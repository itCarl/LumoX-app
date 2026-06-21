# Busking — live, improvised operation

**Status:** guide
**Related:** [mix-engine.md](mix-engine.md) (scenes/banks/FX rack), [selection.md](selection.md),
[tempo.md](tempo.md), [midi.md](midi.md), [color.md](color.md)

A practical guide to operating Lumox **live** — improvising a show in real time
instead of running a pre-recorded, timecoded cue list. This maps the standard
busking workflow used across professional control surfaces onto the primitives
Lumox already has, and explains why the bundled demo show is laid out the way it is.

## What busking is

**Busking** = running the show mostly by hand, reacting to the music, performers
and room moment-to-moment (also called "punting"). The opposite is a fully
**pre-programmed** cue list advanced with a single "go". Busking is the default for
unpredictable, improvised sets — concerts, clubs, DJ sets — where a pre-baked guess
at every moment would feel wrong.

The key idea: **a busked show is not winged from scratch — it is a live remix of
pre-built building blocks.** All the prep goes into making a kit of things you can
fire instantly; the performance is choosing *which* and *when*. So the goal when
preparing a Lumox show for busking is: everything reachable in one gesture, nothing
that needs menu-diving mid-song.

## The busking surface: banks of scenes + MIDI

In Lumox the building blocks are **scenes**, organised into **banks**, and reached
instantly from a **MIDI control surface** (see [midi.md](midi.md)):

- **Banks** are your pages of go-to content. Group scenes by purpose so a whole
  category is one row away — the demo uses *Colors, Bars, Move, Position, Chase, FX,
  Looks, Live, Beams*. On a grid controller, one bank maps to one row of pads.
- **Scene pads** trigger/toggle a scene; **flash** scenes (`flash: true`) are
  momentary — held for hits (strobe, blinder, audience bump) and released on let-go.
- **Group faders** (CC → `group:<id>:intensity`) ride the level of a fixture group
  live; the **GrandMaster** rides everything; **Blackout** kills output instantly.
- Keep the most-used looks on the most reachable pads — *layout is most of the prep*.

## Building blocks

**Groups** ([mix-engine.md](mix-engine.md)) — divide the rig by **type** (washes,
spots, beams, bars, PARs) and/or by **zone** (stage left/right, floor/air). Groups
are what faders, flash keys and FX layers target, so build them first.

**Palettes** ([color.md](color.md)) — reusable, parameter-typed snapshots you recall
on the fly, the classic busking organisation:

- **Colour palettes** — a few saturated primaries + a few complementary wash blends.
- **Position/focus palettes** — named looks (Center, Audience, Cross, Fan, Up).
- **Beam/gobo palettes** — gobo, prism, zoom/focus states.

Split by **attribute** so you can combine on the fly: pick a *position*, then a
*colour*, then a *beam look* independently rather than committing to one fixed scene.

**Intensity stays separate.** Treat colour/position/beam content as re-tinting and
re-aiming what is *already lit*; drive actual brightness from group faders, the
GrandMaster, and base looks. (A colour-only scene that sets no intensity simply
re-colours whatever is up — that is the palette model, not a bug.)

## Layering: base look + FX rack

Every Lumox scene is **a base look plus a stack of FX layers** (the FX rack — see
[[lumox-fx-rack-model]] and [mix-engine.md](mix-engine.md)). That *is* the busking
layering model:

1. **Base look (home state).** Build one or more foundational stage looks you keep
   up as a fallback — a reliable place to return to, with built-in fade in/out, in a
   few moods/colours. The stage should never go fully dark between moments.
2. **Pile dynamics on top.** Layer movement, colour and beam **FX** (circles,
   fans, chases, plasma, strobes) over the base. FX layers target a group and fan
   across the live **selection** ([selection.md](selection.md)).

When multiple scenes/layers touch the same fixtures, output merges by the standard
conventions:

- **Intensity → highest-takes-precedence (HTP):** the brightest contributor wins, so
  pile-ons never dim each other.
- **Attributes (pan/tilt/colour/gobo/beam) → latest-takes-precedence (LTP):** the
  most recent change wins.
- **Scene priority** breaks ties — a `high`-priority scene (e.g. a flash/strobe)
  overrides a `normal` base look while it is active.

This is the conventional default, not an absolute law — but it is what makes
"base + flashes + effects" behave predictably.

## Tempo & beat-sync

Dynamic content must lock to the music. Drive FX and chase speed from the master
**Transport** ([tempo.md](tempo.md)) instead of fixed millisecond rates:

- Set the master BPM by **tap tempo**, **MIDI clock**, **audio onset**, or **Ableton
  Link**.
- Set an FX layer / chase `driveMode` to **beat** with a `beatDiv` (e.g. 1, 1/2,
  1/4) so it re-times automatically as the tempo moves.
- Keep a fast way to **double/halve** speed and to **freeze** movement for a hit.
- Have a couple of premade chases (dimmer chase, ballyhoo, colour chase) ready at
  all times, with speed on a fader so you can match any tempo instantly.

## Performance tips

- **Keep a punt/home button.** A neutral safety look (no movement, lit stage) on a
  pad for instant recovery, plus a "clear-all-to-base" gesture that drops every
  chase/effect and returns to the home state without going black.
- **Use restraint.** Don't use every effect every song; contrast (calm verses, big
  choruses) reads as intentional. Saturating everything all the time flattens energy.
- **Always light the talent.** Keep an easy stage/face wash; spectacle behind a dark
  performer is a miss.
- **Smooth transitions.** Use scene `fadeIn`/`fadeOut` and crossfades; snap only when
  you want a hit.
- **React to song sections.** Build energy into choruses/drops, pull back for
  breakdowns/ballads — that is the whole point of busking over a fixed cue list.

## Common beginner mistakes

- Improvising from an empty rig with no prepared blocks — there is nothing to fire.
- No home/punt look, so a fumble means a black stage.
- Everything maxed all the time (no dynamics, no light on the talent).
- Fixed-rate effects that drift off the beat instead of tempo-synced ones.
- Burying key looks behind menus instead of on reachable pads/faders.

## The demo show is a busking layout

The bundled dev demo (`resources/demo-show.lmx`, see
[build-run.md](build-run.md)) is deliberately a busking-ready rig: type/zone groups,
a *Colors* bank of palettes, *Move/Position/Beams* attribute banks, *Chase* and *FX*
banks of dynamics, gig-ready *Looks*, and a *Live* bank of instant buttons (Full On,
Blinder, Strobe All) — all mapped to a grid controller in [midi.md](midi.md). Open
it and busk.
