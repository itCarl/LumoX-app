# Application Settings

**Status:** stable
**Files:** `main/services/SettingsService.ts`, `main/handlers/settings.ts`,
`renderer/lib/settings.ts`, `renderer/views/settings-modal.ts`,
`main/dto.ts` (`AppSettings`), `renderer/lumox.d.ts`

## What

Machine-scoped application preferences — **separate from any project**. Opened
from the ⋯ app menu (or `Ctrl+,`) as a modal. Covers:

- **Language** — UI locale (`en` / `de`), applied to `<html lang>`. The string
  translation layer is staged; this persists + applies the choice now.
- **Appearance** — accent colour, driving the `--accent` CSS custom property the
  whole theme reads (swatches + custom colour).
- **Project** — autosave period (minutes, `0` = off) and reopen-last-project on
  launch.

> **DMX output transport** (`dmxProtocol` / `broadcastHost` / `maxRateHz`) is
> persisted here too, but its **UI lives in the Connection tab**, not this modal
> (single source of truth) — see [connection.md](connection.md). Likewise the
> **tempo source/device** (`tempoSource` / `midiClockInput`, UI in the Tempo section +
> titlebar — [tempo.md](tempo.md)) and the **audio capture device** (`audioInput`, picked
> on the Connection tab — [connection.md](connection.md)) live in `settings.json`.

Settings are stored as **`settings.json` in the Electron `userData` directory**
(NOT in the `.lmx` project file). Changing a setting never marks the project
dirty — `lumox:settings:*` is a transient IPC area.

## How

```text
renderer modal ──lumox:settings.update──▶ SettingsService ──settings.json (userData)
                                              │
                                  settingsEvents 'changed' (settings, changedKeys)
                                              ├─▶ handlers/settings → push to all windows ─▶ lib/settings applies lang+accent
                                              ├─▶ handlers/settings → recreateBroadcast() if a DMX key moved
                                              └─▶ handlers/project  → reschedule autosave if autosaveMinutes moved
```

- **SettingsService** is the single in-memory store. `loadSettings()` runs once
  at boot (needs app ready for the `userData` path); `getSettings()` /
  `getSetting(k)` read, `updateSettings(patch)` merges + persists + emits. Every
  field is `sanitize()`d on load and update (enum membership, hex colour, numeric
  clamps) so a corrupt or hand-edited file falls back to `DEFAULT_SETTINGS`.
  `updateSettings` emits `'changed'` with the **list of keys that actually moved**
  so listeners can ignore irrelevant updates (e.g. don't tear down the UDP socket
  when only the accent changed).
- **Side effects** live with the modules that own the resource, each subscribing
  to `settingsEvents`: the settings handler recreates the broadcast output
  (`context.recreateBroadcast`) on a DMX-key change and pushes `settings:changed`
  to every window; the project handler reschedules its autosave timer on an
  `autosaveMinutes` change.
- **Startup** (`main/index.ts → bootShow`): after `loadSettings()`, if
  `reopenLastProject` is set and `lastProjectPath` resolves it loads that project
  (`ProjectService.loadProjectFromPath`, shared with the Open dialog); otherwise
  it seeds the dev demo / blank show. The broadcast output is then created from
  the DMX settings.
- **`lastProjectPath`** is recorded by the project handler on every save/open via
  `SettingsService.setLastProjectPath` (no-op when unchanged).
- **Renderer** (`lib/settings.ts`): `initAppSettings()` fetches once, applies
  `lang` + `--accent`, and re-applies on every `settings:changed`. Called per
  window so the accent/language reach the fixture-editor window too.

## Adding a setting

1. Add the field to `AppSettings` in `main/dto.ts` **and** `renderer/lumox.d.ts`.
2. Add its default + `sanitize()` rule in `SettingsService.ts`.
3. Add a control to `renderer/views/settings-modal.ts`.
4. If it has a side effect, subscribe to `settingsEvents` in the owning module
   and guard on the relevant key in `changedKeys`.

## Notes / Gotchas

- App settings are intentionally **not** migrated (project convention: no
  back-compat). An unreadable/old file just resets to defaults.
- Switching the broadcast protocol/host/rate closes and reopens the UDP socket;
  a brief output gap on change is expected.
- sACN uses multicast — the broadcast-host field is disabled for it.
