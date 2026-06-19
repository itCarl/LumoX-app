# Connection Tab — DMX Output Patch

**Status:** stable
**Files:** `renderer/views/connection.ts`, `renderer/index.{html,ts}`,
`renderer/styles/main.css` (`.cx-*`), `main/handlers/outputs.ts`,
`main/context.ts` (per-universe output map), `main/services/ProjectService.ts`

## What

A dedicated titlebar tab (`Setup` · `Control` · **`Connection`**) that configures
the DMX **output patch** — the I/O page of the controller. It is a **per-universe**
table: each engine universe has its own output with a protocol (**Art-Net** /
**sACN E1.31**), target IP, **frame mode**, refresh-rate cap, and on/off, plus a
live transmit indicator.

The patch is stored **in the project** (`devices`), so the output mapping travels
with the show.

## How

- **Per-universe map** (`context.ts`) — one `Output` per universe, kept in
  `outputsByUniverse`. The map (not an output's runtime `subscribedUniverses`) is
  the source of truth for which universe an output belongs to.
  - `setUniverseOutput(cfg)` upserts a universe's output (recreates the socket only
    when the protocol changes); `removeUniverseOutput`, `applyOutputPatch` (replace
    all), and `seedDefaultOutputs` (one per universe from the global DMX defaults).
- **Live-gating** (`updateActiveUniverses`) — `standard` outputs transmit only
  while their universe is live (active scene / manual programmer) plus a release
  linger; `full`/`partial` transmit continuously. Gating toggles the runtime
  subscription between `[universeId]` and the `NO_UNIVERSE` sentinel.
- **Universes** — a new/blank project starts with **5** universes (`UNIVERSE_COUNT`
  in ProjectService). The Connection tab's **Add universe** button
  (`lumox:outputs:addUniverse` → `context.addUniverse`) appends the next universe
  with a default output, up to `MAX_UNIVERSES` (16 — the default Art-Net net 0 /
  subnet 0 range). A project load ensures every universe its patch/outputs
  reference (at least the default count) and drops extras.
- **Seeding / persistence** — `newProject` seeds a default output per universe from
  the global DMX defaults (`dmxProtocol`/`broadcastHost`/`maxRateHz` in settings, now
  just defaults). A project load (including the dev demo show, `resources/demo-show.lmx`)
  applies the saved `devices` patch (or seeds defaults if the project carries none).
- **IPC** — `lumox:outputs:patch` returns one row per universe (config + live
  status); `lumox:outputs:setUniverse` upserts; `lumox:outputs:removeUniverse`
  drops one. Editing flags the project dirty. `lumox:outputs:list` stays for raw
  status.
- **UI** — a 7-column grid (universe · protocol · target IP · frame mode · rate ·
  on/off · status). The IP field disables for sACN (multicast). Status polls
  `lumox.outputs.patch()` while the tab is visible (gated by an
  `IntersectionObserver`); config edits rebuild the table, the poll only updates
  the status dots so it never clobbers a focused control.

## Notes / Gotchas

- Frame modes (standard / full / partial) and the protocol defaults are documented
  in [artnet-protocol.md](artnet-protocol.md).
- The global DMX settings (`dmxProtocol`/`broadcastHost`/`maxRateHz`) survive only
  as **defaults** for seeding new universe outputs — they no longer drive a single
  live output, and the Connection tab no longer writes them.
- Universe ids shown are engine universe ids (with their display names), not
  Art-Net port-addresses.
- **Discovery** — below the patch, a "Discovered nodes" panel with a **Scan**
  button finds Art-Net nodes on the network and one-click **Assign**s a node's IP to
  the matching universe (sets protocol = Art-Net). Scanning is manual and auto-stops
  after ~2 minutes. Full detail: [discovery.md](discovery.md).
