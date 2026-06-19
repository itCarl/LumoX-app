# Network Node Discovery

**Status:** stable
**Files:** `src/discovery/DiscoveryService.ts`, `src/protocols/artnet.ts`
(`parsePollReply`), `main/handlers/discovery.ts`, `main/context.ts` (`discovery`
singleton), `main/index.ts` (`shutdown`), `preload.ts`, `renderer/lumox.d.ts`,
`renderer/views/connection.ts`, `renderer/styles/main.css` (`.cx-disc-*`)

## What

Finds DMX output nodes on the network so the Connection tab can fill a universe's
**target IP** without typing it. Discovery is **Art-Net only** (ArtPoll →
ArtPollReply): it covers the Lumox ESP32 firmware (which answers ArtPoll and
re-announces every ~10 s) plus any standard Art-Net node. **sACN / E1.31 has no
node-discovery mechanism on the wire** — discovered nodes can still be assigned
to an sACN universe (it just sets a unicast host / confirms the node is reachable).

## How

- **Dedicated 6454 listener** — `DiscoveryService` (engine, pure Node) binds **one**
  UDP socket to `0.0.0.0:6454` with `reuseAddr`. This is separate from the
  per-universe `ArtNetOutput` sockets (those are send-only on ephemeral ports,
  rate-capped, one-per-universe). The dedicated listener catches both solicited
  ArtPollReplies and a node's unsolicited periodic broadcasts.
- **Polling** — `start()` sends an ArtPoll immediately, then every `pollIntervalMs`
  (3 s). `poll()` broadcasts to `255.255.255.255` **and** each interface's directed
  broadcast (`ip | ~mask` from `os.networkInterfaces()`), because limited broadcast
  isn't reliably routed to every subnet on Windows (and the firmware itself answers
  per-interface). This matters for the WiFi-AP + Ethernet host setup.
- **Parsing** — `parsePacket` → `parsePollReply` returns IP, MAC (bytes 201-206),
  ShortName/LongName, VersInfo (firmware), OEM and the universe (decoded from
  NetSwitch/SubSwitch/SwOut via `portAddress`). Devices are kept in a
  `Map<mac, DiscoveredDevice>` keyed by MAC (IP fallback if a node sends none).
- **Decay** — a node unseen for `expiryMs` (30 s, ≈3× the firmware announce
  interval) is dropped, so powered-off nodes disappear.
- **Events** — the service emits `changed` (the device list) on any add / update /
  decay, and `status` (`stopped` | `running` | `degraded`).
- **IPC** — `main/handlers/discovery.ts`: `lumox:discovery:start` (returns the
  status), `:stop`, `:list`; it forwards `changed` to the renderer as
  `discovery:changed`. The `discovery` area is **transient** (never marks the
  project dirty) and not persisted.
- **Renderer** — the Connection tab shows a **Discovered nodes** panel with a
  **Scan** button. Scanning is **manual**: pressing Scan calls
  `lumox.discovery.start()`; it **auto-stops after ~2 minutes** (and on tab hide),
  releasing the socket — found nodes stay listed afterwards so they can still be
  assigned. The panel renders on `lumox.discovery.onChanged`. Each row shows name
  (+ a **Lumox** badge), IP, universe and firmware, with an **Assign** action: one
  click when the node's reported universe matches a patch row (or there's only one
  universe), otherwise a small universe picker. Assign calls
  `lumox.outputs.setUniverse` with `protocol: 'artnet'` + the node's IP.

## Notes / Gotchas

- **6454 bind conflict** — if another Art-Net application already holds UDP 6454
  without `SO_REUSEADDR`, the bind fails; the service goes **`degraded`** instead of
  throwing, and the panel shows "Unavailable — UDP 6454 in use". `reuseAddr` covers
  the common coexistence case.
- **Windows firewall** — the first broadcast prompts to allow the app on
  Private/Public networks; if denied, replies never arrive and the list stays empty.
- **Lifecycle** — `start()` is a no-op while listening, `stop()` a no-op while
  stopped. The renderer auto-stops a scan after ~2 min and on tab hide; the engine
  `start()` has no built-in timeout (the renderer owns that). `main/index.ts
  shutdown()` stops it on every quit path, so the socket + timers never leak.
- **Universe numbers** are decoded Art-Net port-addresses, not engine universe ids
  (see [connection.md](connection.md)); the Assign auto-match relies on the default
  net 0 / subnet 0 mapping where engine universe id N ↔ Art-Net universe N.
- Wire-format details (ArtPoll / ArtPollReply fields) are in
  [artnet-protocol.md](artnet-protocol.md).
