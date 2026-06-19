# Architecture (App's place in the system)

**Status:** stable
**Files:** whole app

## What

Lumox is a wireless DMX system. A laptop hosts a WiFi hotspot and runs **this
app** (the Electron controller); ESP32 nodes (a separate project,
`lumox-firmware`) join as WiFi/Ethernet clients, each outputting one DMX512
universe. Transport is Art-Net (default) or sACN E1.31 over UDP — compatible with
standard Art-Net / sACN consoles, software, and nodes.

## How

```text
Laptop (WiFi Hotspot + Lumox App)
│   Art-Net / sACN UDP unicast (Art-Net port 6454, sACN port 5568)
├── ESP32 "Stage Left"  → Universe 0 → DMX512 XLR
├── ESP32 "Stage Right" → Universe 1 → DMX512 XLR
└── ESP32 "Truss"       → Universe 2 → DMX512 XLR
```

- **This app = host/controller** — drives everything: patch, mix engine, scenes,
  and the Art-Net/sACN output. Internals: [app.md](app.md), [mix-engine.md](mix-engine.md).
- **ESP32 nodes = clients** — one DMX universe each; configured and discovered
  over the network. The firmware is its own project (`lumox-firmware`).
- **Discovery** — ArtPoll broadcast (Art-Net) + mDNS `_lumox._tcp` / `lumox.local`.
- **Wire protocol** — [artnet-protocol.md](artnet-protocol.md).

## New-device setup workflow

1. Flash an ESP32 → it boots in AP mode (SSID `Lumox`).
2. Join the `Lumox` AP → open `192.168.4.1`.
3. Enable STA mode, enter the hotspot SSID/password, set universe (+ protocol).
4. Save & reboot → the node connects to the hotspot.
5. The app auto-discovers the node via ArtPoll.

## Notes / Gotchas

- DMX data is sent **unicast** (not broadcast) → less WiFi congestion.
- Node-side detail lives in the `lumox-firmware` project, not in this KB.
