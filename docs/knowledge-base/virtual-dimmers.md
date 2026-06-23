# Virtual dimmers

Some fixtures mix colour but have **no intensity/dimmer channel** — an RGB PAR
or an LED bar with one RGB cluster per segment. Without a dimmer, brightness can't
be ridden independently of colour: group dimmer, grand master, and intensity FX do
nothing, and a scene could only store "darker" by storing dimmer RGB (lossy —
dragging to 0% loses the colour).

A **virtual dimmer** fixes this: each RGB cluster of such a fixture gets a
synthetic intensity control that scales that cluster's R/G/B(/W) at output. It
behaves like a real dimmer — a fader in the fader editor, stored per scene,
driven by group dimmer / grand master / intensity FX — and is lossless (colour
preserved at 0%). A 4-segment RGB bar gets 4 virtual dimmers; a single-cluster
RGB PAR gets one.

## How it works — a channel in the virtual region

The trick is to treat a virtual dimmer as an ordinary channel that lives in the
universe's **virtual region** — addresses above the 512 wire channels. Universe
buffers are `TOTAL_CHANNELS` (1024) long: `DMX_CHANNELS` (512) real + `VIRTUAL_CHANNELS`
(512) virtual (`src/core/Universe.ts`). Because it is just another channel, a
virtual dimmer rides the entire existing mix/scene/fade/HTP/FX/fader machinery
for free, and because the Art-Net/sACN encoders cap every frame at 512
(`src/protocols/artnet.ts`, `src/protocols/sacn.ts`) it never reaches the wire.

- **Address scheme** — a cluster's virtual address is `DMX_CHANNELS + redAddr`
  (the cluster's RED DMX address). Red addresses are unique across non-overlapping
  fixtures and lie in 1..512, so virtual addresses are unique and land in
  513..1024, and are **stable** across reload/re-patch with no extra persistence
  (re-addressing a fixture moves its virtual address with it, exactly like its
  real channels).
- **Qualification** — a fixture gets virtual dimmers when it has **no
  `isIntensity` channel at all** AND at least one RGB cluster. Detection is
  whole-fixture; exposure is **per-emitter cell** via `Fixture.virtualDimmers()`
  (built on `emitterColorAddresses()`, one entry per cluster/head). A fixture whose
  emitter **heads carry their own dimmer** channels is *not* virtual — each head's
  real `dimmer` is used instead; mixed heads (some with a dimmer, some without) is
  unsupported by design (any real intensity channel makes the whole fixture non-virtual).
- **Default full (255)** — a virtual dimmer **rests at 100%**, so an RGB-only
  fixture shows its colour at full brightness with no extra step; the dimmer is an
  optional attenuator you ride down. To hold "rest at full" everywhere, the
  programmer is **seeded** to 255 for every virtual cluster — on patch add
  (`main/handlers/patch.ts`), project load/move (`Fixture.apply` → `applyVirtual`),
  and after a programmer Clear (`clearProgrammer`,
  `main/services/OutputPatchService.ts` → `seedVirtualDimmers`,
  `main/services/FixtureMaps.ts`).
- **Live-only flag** — virtual channels never transmit, so `markLiveUniverse`
  scans only the wire range (`0..DMX_CHANNELS`); a seeded virtual dimmer alone
  doesn't make a universe "live".

## Engine (`src/`)

- `Fixture.needsVirtualDimmer()` / `Fixture.virtualDimmers()` (`src/fixtures/Fixture.ts`)
  — detection + per-cluster resolution (`{ virtualAddr, r, g, b, w? }`).
- `Fixture.set('intensity'|'intensity-master', v)` fans across **every** real
  intensity channel first (so a fixture with one dimmer per head/cluster dims all
  heads, not just the first); only when there's **no** real intensity channel does
  it write every cluster's level into `Fixture.virtualLevels`, which `Fixture.apply()`
  flushes into the programmer's virtual region — what lets a **group dimmer**
  (`Group.setIntensity`) and master macros dim an RGB-only fixture.
- `VirtualDimmer` mix module (`src/mix/modules/VirtualDimmer.ts`) — a post-mix
  stage that, per cluster, reads `data[virtualAddr]` and multiplies the cluster's
  composited R/G/B(/W) by `v/255`. It runs **after** compositing (Limits) and
  **before** the masters (GrandMaster/Blackout) so the masters scale the
  already-dimmed colour once — the correct real-dimmer analogue. The engine stays
  fixture-agnostic; the app supplies the per-universe `VirtualDimmerMap`.

## App / IPC (`main/`)

- `buildVirtualDimmerMap()` / `rebuildVirtualDimmers()` in `main/services/FixtureMaps.ts`
  resolve every fixture's clusters into the module. `rebuildFixtureMaps()` rebuilds
  limits + virtual dimmers together and is called on any patch change (add / move /
  remove in `main/handlers/patch.ts`, project load in `ProjectService`).
- **FX intensity targeting** — `targetsForKind` (`main/services/SceneCompiler.ts`) resolves an
  `intensity` FX on an RGB-only fixture to one target **per cluster** (the virtual
  addresses), so an intensity chaser/wave fans across a bar's segments.
- **Fader / scene IPC** — virtual channels are not fixture-local, so the renderer
  passes an explicit `absChannel` (the virtual address) to `lumox.fixtures.setChannel`/
  `releaseChannel` and `lumox.scenes.setChannel`; the handlers validate it against
  the fixture's own `virtualDimmers()` before engaging / storing.
- **Serializer / DTO** — `fixtureJSON` (`main/serializers.ts`) appends one
  synthetic `ChannelDTO` per virtual dimmer with `isVirtual: true`,
  `absAddress: <virtualAddr>`, `typeId/group: 'intensity'`, and a "Virtual Dim"
  name (numbered when there is more than one cluster).

## Renderer (`renderer/`)

The fader editor (`renderer/views/fadereditor.ts`) renders the synthetic channels
automatically (they arrive in `fixture.channels`). A channel's universe-absolute
address is `c.absAddress ?? (startAddress + index - 1)` — virtual faders use the
explicit `absAddress` for both EDIT-mode scene lookup and LIVE/scene writes. An
untouched virtual fader reads **100%** in LIVE (matching the seeded engine value).

In the **FADER** (all-channels) view each RGB cluster gets its **own** collapsed
dimmer drawer right after that cluster's faders (`.fe-vdim`, positioned via the
DTO's `afterIndex` = the cluster's last real channel). A slim vertical **DIM**
toggle reveals just that cluster's fader; the open set is tracked per cluster
(`state.vdimOpen: Set`), keeping the RGB faders front and centre while each optional
dimmer stays out of the way until needed. Selecting the **DIMMER** sidebar category
instead filters the strips to the intensity group — the virtual dimmers (carrying
`group: 'intensity'`) render as plain strips alongside any real dimmer. The Patch
grid and Debug view stay at 512 channels, so virtual channels never show there.

## Not covered

- **Only live fader drags dim a virtual dimmer; scenes and FX can't pull it
  below full.** Because the dimmer rests at full (programmer base 255) and the
  SceneMixer HTP-maxes everything through it (scene base *and* FX layers) against
  that base, a stored or FX-driven *lower* value loses the `max` and the cluster
  stays full. A live fader drag dims because it writes the programmer base directly.
  For per-scene brightness use the scene's **level** (opacity), which scales the RGB
  output itself. This is the deliberate trade-off for "100% by default"; honouring
  stored/FX dimmer values would require inverting the model (store attenuation so
  0 = rest = full).
- Virtual channels aren't bindable by raw MIDI/audio **DMX channel** number
  (those clamp 1..512). The **group-intensity** and **master** bindings still
  drive them, and a virtual fader's own per-fixture MIDI target (`fixture:<id>:<index>`)
  works.
- The app's GrandMaster runs in `'all'` mode, which scales the virtual region
  automatically. If intensity-only mode is ever wired, `Patch.intensityChannels()`
  must also include the virtual addresses.
