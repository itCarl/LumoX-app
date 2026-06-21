# Art-Net & sACN Protocol + Discovery

**Status:** stable
**Files:** `src/protocols/artnet.ts`, `src/protocols/sacn.ts`, `src/outputs/ArtNetOutput.ts`, `src/outputs/SacnOutput.ts`

## What

Transport between the app and the ESP32 nodes: **Art-Net** over UDP 6454 (default)
or **sACN E1.31** over UDP 5568, compatible with standard Art-Net / sACN gear.
Each node = one universe.

## How

- **DMX data (app → node)** — the app sends ArtDMX / sACN data **unicast** per
  device (`src/outputs/ArtNetOutput.ts`, `SacnOutput.ts`; wire encoders in
  `src/protocols/`). Art-Net output is rate-capped at **44 Hz**.
- **Discovery (app side)** — **Art-Net ArtPoll**, implemented in
  `src/discovery/DiscoveryService.ts`: a dedicated UDP 6454 listener broadcasts
  ArtPoll periodically and collects ArtPollReply (`parsePollReply` parses IP, MAC,
  ShortName/LongName, firmware, universe). sACN has no wire discovery; mDNS is not
  used. Full detail: [discovery.md](discovery.md).
- **sACN** — priority byte clamped 0–200 (`buildDataPacket` in `src/protocols/sacn.ts`); per-universe multicast group `239.255.<U high>.<U low>`.

## Transmission (frame) modes

Every `Output` has a `frameMode` (`src/outputs/Output.ts`) — grounded in the
Art-Net/sACN refresh + keep-alive rules (Art-Net caps at 44 Hz; both re-send
unchanged data as a keep-alive, ~0.8–4 s):

- **standard** (default) — send only when a channel changes, plus a keep-alive
  heartbeat (`keepAliveMs`). Full 512-channel frame. Lowest traffic — best for the
  wireless link to the ESP32 nodes.
- **full** — transmit all 512 channels every cycle (continuous), capped at
  `maxRateHz`. For nodes/fixtures that expect a steady stream.
- **partial** — transmit continuously but only up to the highest used channel
  (tracked as a per-universe high-water mark so it never shrinks → no stale
  channels). Smaller packets; the receiver must accept a short frame.

`shouldSend` gates timing (standard = dirty/keep-alive, full/partial = continuous);
`_frameData` trims the frame for partial. Persisted per output in the project
(`devices[].frameMode`) and editable via `lumox:outputs:create/update`.

## Notes / Gotchas

- The output transport (protocol, target IP, refresh cap, frame mode) is
  configured in the app's **Connection tab** — see [connection.md](connection.md).
  Output config (protocol/host/rate/frame mode per universe) persists **in the
  project** (`devices` array), so it travels with the show.
- Unicast (not broadcast) for DMX → less WiFi congestion.
- The node side (ingress arbitration, OpAddress remote config, etc.) lives in the
  `lumox-firmware` project, not in this KB.
