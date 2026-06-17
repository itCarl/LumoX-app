# Lumox Examples

Standalone scripts demonstrating each subsystem. Run from the `lumox-app`
directory:

```bash
node examples/01-engine.js
node examples/02-output-artnet.js
...
```

All examples that spin a tick loop keep running until `Ctrl+C`. Examples
that just print and exit say so in their banner.

## Files

| # | File | Demonstrates |
|---|------|--------------|
| 01 | `01-engine.js` | Engine boot, universe creation, programmer writes |
| 02 | `02-output-artnet.js` | Art-Net broadcast output |
| 03 | `03-output-sacn.js` | sACN E1.31 multicast output |
| 04 | `04-multi-universe.js` | Multi-universe routing across outputs |
| 05 | `05-mix-grandmaster.js` | GrandMaster intensity scaling |
| 06 | `06-mix-blackout.js` | Blackout toggle |
| 07 | `07-mix-scenes.js` | Scene mixer HTP/LTP blending with opacity |
| 08 | `08-mix-effects.js` | Sine, strobe, chase generator effects |
| 09 | `09-mix-custom-module.js` | Writing a custom MixModule (gamma curve) |
| 10 | `10-fixtures.js` | Profile + mode + patch + fixture API |
| 11 | `11-fixtures-rgbw-16bit.js` | RGBW + 16-bit pan/tilt + intensity mask |
| 12 | `12-fixture-library.js` | Library search and filtering |
| 13 | `13-import-lumox.js` | Lumox JSON import + export round-trip |
| 14 | `14-import-qlc-plus.js` | QLC+ 5 `.qxf` import |
| 15 | `15-custom-channel-type.js` | Register a new ChannelType |
| 16 | `16-custom-capability.js` | Register a new Capability kind |
| 17 | `17-custom-output.js` | Register a custom output (console printer) |
| 18 | `18-builtin-library.js` | Load shipped fixture profiles from `lumox-app/fixtures/` |
| 19 | `19-validate-fixtures.js` | Validate fixture files against schema + semantic checks |
| 20 | `20-groups.js` | Group fixtures, apply batch ops (setRGB / setIntensity) |
| 21 | `21-group-effects.js` | Fixture-aware effects (rainbow / chase / sine) targeting a Group |
| 22 | `22-control-par.js` | **Full end-to-end PAR control** — library → patch → output → color sequence |
| 23 | `23-midi-apc-mini.js` | AKAI APC Mini MK2 controller — pads / faders / scene buttons / LED feedback (use `--mock` without hardware) |
| 24 | `24-scenes.js` | Record scenes from fixture state, register in SceneMixer, crossfade between them |

## Sample data

`examples/data/`

| File | Format |
|------|--------|
| `demo-mover.lumox.json` | Native Lumox JSON — 7-ch RGBW moving head |
| `demo-par.qxf` | QLC+ 5 XML — 3-ch RGB PAR |

## Tip — watching DMX traffic

Use the `lumox-dmx-monitor` sketch (sibling project) on an ESP32 with the
DMX hardware to see live frames on a serial terminal.

Or run Wireshark on UDP 6454 (Art-Net) / 5568 (sACN) to inspect packets
without hardware.
