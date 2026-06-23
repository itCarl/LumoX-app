# Connection Tab — DMX Output Patch

**Status:** stable
**Files:** `renderer/views/connection.ts`, `renderer/index.{html,ts}`,
`renderer/styles/main.css` (`.cx-*`), `main/handlers/outputs.ts`,
`main/services/OutputPatchService.ts` (per-universe output map), `main/services/ProjectService.ts`,
`renderer/lib/audio-engine.ts` + `main/services/SettingsService.ts` (`audioInput`) for
the audio-input picker

## What

A dedicated titlebar tab (`Setup` · `Control` · **`Connection`**) — the **I/O page**
of the controller. A left **section rail** switches between two full-width sections
(one at a time, mirroring the Scene panel's rail):

- **Output** — the DMX **output patch** beside the network **node finder**.
- **Audio** — the **capture source** picker + meter and the **reactive bindings** table.

The patch is a **per-universe** table listing only universes with **fixtures patched
into them** — it follows what's in use, staying empty until you patch a fixture and
growing a row per universe a fixture lands in. Each row is that universe's output: a
protocol (**Art-Net** / **sACN E1.31**), target IP, **frame mode**, refresh-rate cap,
and on/off, plus a live transmit indicator. It is stored **in the project**
(`devices`), so the output mapping travels with the show.

## How

- **Per-universe map** (`OutputPatchService.ts`) — one `Output` per universe, kept in
  `outputsByUniverse`. The map (not an output's runtime `subscribedUniverses`) is
  the source of truth for which universe an output belongs to.
  - `setUniverseOutput(cfg)` upserts a universe's output (recreates the socket only
    when the protocol changes); `removeUniverseOutput`, `applyOutputPatch` (replace
    all), `seedDefaultOutputs` (one per **patched** universe from the global DMX
    defaults), and `pruneUnusedOutputs` (close the output of any universe that no
    longer has a fixture).
  - **An output exists only for a universe with a fixture patched into it.** A
    socket is opened on demand when a fixture lands in a universe and closed when
    the last one leaves — so a blank show opens no outputs at all.
- **Live-gating** (`updateActiveUniverses`) — `standard` outputs transmit only
  while their universe is live (active scene / manual programmer) plus a release
  linger; `full`/`partial` transmit continuously. Gating toggles the runtime
  subscription between `[universeId]` and the `NO_UNIVERSE` sentinel.
- **Universes follow the patch** — there is no "add universe" action. You create a
  universe by **patching a fixture into it** from the Patch tile, whose universe
  picker offers **100** universes (Universe 1..100). Patching into a universe that
  has no output yet auto-creates a default **enabled** output
  (`OutputPatchService.ensureUniverseOutput`, called from `lumox:patch:add` / `:move`),
  so the new universe shows as a real, transmitting row here. Removing the last
  fixture from a universe closes its output again (`pruneUnusedOutputs`, called from
  `lumox:patch:remove` / `:move`). The Connection patch (`lumox:outputs:patch`)
  returns one row only for universes with patched fixtures — with none, the pane
  shows an empty hint. A new/blank project opens **no** outputs; the engine still
  pre-creates `UNIVERSE_COUNT` (**5**) universe buffers, but outputs follow the patch.
- **Seeding / persistence** — `newProject` opens no outputs (the show is empty); each
  one is created on demand as fixtures are patched, from the global DMX defaults
  (`dmxProtocol`/`broadcastHost`/`maxRateHz` in settings, now just defaults). A project
  load (including the dev demo show, `resources/demo-show-1.lmx`) applies the saved
  `devices` patch (or seeds defaults if the project carries none), in both cases
  **filtered to universes that have a fixture patched** — stale `devices` entries for
  empty universes are dropped, so only in-use universes open a socket.
- **IPC** — `lumox:outputs:patch` returns one row per **patched** universe (config +
  live status); `lumox:outputs:setUniverse` upserts; `lumox:outputs:removeUniverse`
  drops one. Editing flags the project dirty. `lumox:outputs:list` stays for raw
  status.
- **UI** — a left section rail (Output / Audio) over the I/O area; each section is
  one or more flat `--bg-2` panes (depth by fill, not borders). The **Output**
  section is a two-pane split: the patch (primary) — a 7-column grid (universe ·
  protocol · target IP · frame mode · rate · on/off · status), width-capped so rows
  stay dense — beside the **Network nodes** finder. The IP field disables for sACN
  (multicast). Status polls `lumox.outputs.patch()` while the tab is visible (gated
  by an `IntersectionObserver`); config edits rebuild the table, the poll only
  updates the status dots so it never clobbers a focused control.

## Audio input

The rail's **Audio** section picks the capture source (machine-scoped `audioInput`
setting) for the renderer's shared Web-Audio engine and hosts the live meter, **Bands**
count field, and **Reactive bindings** table. Full detail — capture, band extraction,
binding model and IPC — lives in [audio.md](audio.md).

## Notes / Gotchas

- Frame modes (standard / full / partial) and the protocol defaults are documented
  in [artnet-protocol.md](artnet-protocol.md).
- The global DMX settings (`dmxProtocol`/`broadcastHost`/`maxRateHz`) survive only
  as **defaults** for seeding new universe outputs — they no longer drive a single
  live output, and the Connection tab no longer writes them.
- Universe ids shown are engine universe ids (with their display names), not
  Art-Net port-addresses.
- **Discovery** — beside the patch (Output section), a "Network nodes" panel with a
  **Scan** button finds Art-Net nodes on the network and one-click **Assign**s a
  node's IP to the matching universe (sets protocol = Art-Net). Scanning is manual
  and auto-stops after ~2 minutes. Full detail: [discovery.md](discovery.md).
