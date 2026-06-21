---
name: app-explorer
description: Explore and understand another Windows application — see how it behaves and what functions it has. Captures the screen to a PNG so Claude can look, then drives the app (move/click/scroll/type/keys) to open its menus, page through its views, and discover what it does. Use when the user wants Claude to inspect another program's UI, map its features, or figure out how some behaviour works. One DPI-aware coordinate space ties capture pixels to click points.
---

Find out what another application can do and how it behaves — by looking at it and
operating it. This skill combines two capabilities through one DPI-aware driver so
they share a single pixel coordinate space:

- **See** — snapshot the desktop (or one monitor) to a PNG that Claude reads.
- **Act** — move the mouse, click / double / right / middle click, drag, scroll,
  type text, and send keystrokes to navigate the app.

The core loop for understanding an app is **capture → read the PNG → act → capture
again → describe what changed**. Pixel coordinates reported by `capture` are exactly
the coordinates `click` expects, so you can point at anything you see.

## Seed real data first — an empty app shows nothing

**The single most important prerequisite, for any app: make sure it's populated
with realistic data before you start driving it.** A blank canvas, an empty
project, a document with no content, or a fresh install hides exactly the
surfaces you came to study — disabled toolbars, empty panels, greyed-out menus,
and views that only render once there's something to act on. You will misread
"nothing here" as "no feature here." **Always seed first** — this matters
*especially for third-party / unfamiliar applications*, where you have no other
way to know whether a surface is genuinely empty or just waiting for content.

- **Open or create representative content** before mapping features — a project
  with a few real items, a loaded document, a populated list — so menus enable
  and panels fill. If the app ships sample/demo content, load it.
- **Seed for the thing you're studying.** If the point is to research how it
  edits items, seed several items; if it's a detail/inspector panel, select
  something so the panel has a target; if it's an effect/transform, seed
  something for it to act on. Whatever a surface needs to come alive, put it
  there first — then explore.
- **Exploring Lumox specifically** — boot it with the demo show loaded. The
  `run-app` skill's launcher seeds a full rig (fixtures + groups + scenes) when
  `LUMOX_SEED=1` (it sets this for you); never explore a blank `LUMOX_SEED=0`
  boot. For the *normal* app window (not a screenshot scenario), launch a dev
  build so the demo rig seeds automatically (`!app.isPackaged`), or load a saved
  show / import fixtures so every panel has content.

If you find yourself staring at empty panels or dead controls, stop and seed
before continuing — don't report absence that's really just an empty project.

## Go deep, then write a rebuild-grade document

The expectation for this skill is a **deep exploration** that ends in **detailed
written documentation** — not a quick once-over and a few bullet points. The bar
for the final document is concrete:

> **A different agent must be able to rebuild the surface from your document
> alone, having never seen — and with no access to — the real application.**

If your write-up leaves that agent guessing about a layout, a value, a state, or
a behaviour, it isn't done. Hold every section to that test.

- **Be exhaustive about coverage.** Visit every menu, panel, mode, dialog, and
  state you can reach — including empty/error/selected/multi-select states — not
  just the happy path. Note what you could *not* reach and why.
- **Document at build fidelity**, per surface:
  - **Layout** — an ASCII wireframe plus a "left → right / top → bottom" account
    of every region, its place, grouping, reading order, and what's primary vs.
    secondary (the existing layout section below is the standard).
  - **Every control** — its type, label, exact values/ranges/defaults, units,
    states (enabled/disabled/active), and what it's grouped with.
  - **Behaviour** — cause → effect for each interaction you tried: what changed,
    in which region, and how it responded (animation, snap, live update).
  - **Proportions & alignment** — sizes, aspect, spacing, alignment — the
    decisions a rebuilder must reproduce.
  - **Flows** — the step sequence for each task the surface supports.
- **Back every claim with evidence** — reference the specific (cropped) captures
  you read, and the interaction you ran to confirm a behaviour. Don't assert from
  a blurry full-screen shot (see "GET THE DETAILS").
- **Structure it as a spec**, surface by surface, so it reads as build
  instructions — the `docs/research/daslight5-*.md` notes are the reference
  format and fidelity. Still **concept reference only**: detailed enough to
  rebuild *the capability natively*, never to clone another product pixel-for-pixel
  (see the repo guardrail below).

## What "explore" means here

The goal is to **observe and report**, not to reproduce. Drive the app to surface
its behaviour and feature set, then summarise findings for the user:

- Open each top menu / toolbar / panel and note the commands it exposes.
- Hover, click, and page through views; capture before and after to see what an
  action does.
- Try a control, observe the result, and record the cause → effect.
- Build a map: "this app has X, Y, Z; doing A produces B."
- **Record the layout, not just the feature list** (see below).

## Capture the layout, not only the features

How a surface is *arranged* is as valuable as what it can do — it's usually what
informs a native redesign. For each panel/window you document, note its **spatial
layout** alongside its commands:

- **Regions & their place** — name each block and where it sits (e.g. "dimmer fader
  far-left, 2D movement box centre, numeric fields + invert toggles right"). A quick
  ASCII sketch of the arrangement beats prose.
- **Grouping & order** — what's grouped together, reading order, what's primary vs.
  secondary, which controls sit adjacent because they're used together.
- **Proportions & orientation** — rough sizes and aspect (is the fader vertical or
  horizontal? is the panel a wide row or a narrow column?), and how space is used
  (dense, stretched, or padded) — these decisions are the point.
- **Responsive behaviour** — if you can resize the window, note what reflows, wraps,
  or stays fixed.

Write these as part of the findings (the existing `docs/research/daslight5-*.md`
notes are the reference format: a "panel layout (left → right)" line or an ASCII
wireframe per surface). Still **concept reference only** — describe the arrangement
to understand it, never to clone it pixel-for-pixel (see the guardrail below).

## GET THE DETAILS — the most important habit

A redesign is only as good as the detail you actually looked at. The #1 failure
mode is **working from a single downscaled full-screen shot and guessing** — you
miss which side a panel is on, what's grouped with what, the exact field order,
and the proportions, then build the wrong thing. **Do not do this.** When the
point of exploring is to reproduce or redesign a surface:

- **Never settle for the orienting shot.** The first full-monitor capture is only
  to *find* the panel. Then **zoom in** with a tight `-RX/-RY/-RW/-RH` crop at
  `-Scale 2`–`4` on **every sub-region** until text, icons, handles, and
  separators are crisp. Read each crop.
- **Read the actual values, not the gist.** Field labels, the exact numbers, the
  order of rows, which control is left vs right of which, where the dividers/borders
  are, whether values are left- or right-aligned. If you can't read it, crop tighter.
- **One crop per block.** A panel with a fader + a 2D pad + a field column is
  *three* detail crops, not one. Capture the fader, the pad (with its handles), and
  the field stack separately.
- **State proportions and alignment**, because they drive the rebuild: is the fader
  vertical or horizontal, is the field column to the left or right of the pad, are
  the value boxes right-aligned, what's the reading order top-to-bottom.
- **Verify by interacting**, not just looking: drag a handle / open a field and
  re-capture to confirm what it does and how it responds (see "verify in the real
  app" loops). A static shot can mislead about behaviour.
- **If you're about to build from memory of a blurry shot — stop and re-crop.**
  Re-exploring is cheap; shipping the wrong layout is not.

## Repo guardrail — concept reference, not cloning

When the app being explored is a *third-party lighting-control program*, use what
you learn only to understand a **concept**, then build natively in Lumox's own
design language. Never copy another product's UI — see `CLAUDE.md`: build
capabilities generically. Exploring general apps (browsers, editors, OS dialogs)
for the user's workflow is fine.

## Run it

One `-Action` per call. All coordinates are absolute physical pixels on the virtual
desktop (top-left = `0,0`).

```bash
# SEE — capture so you can look (prints "WxH -> <abs path>" on the last line; then Read that PNG)
powershell -File .claude/skills/app-explorer/control.ps1 -Action capture
powershell -File .claude/skills/app-explorer/control.ps1 -Action capture -Monitor 0   # one monitor (0-based)

# SEE IN DETAIL — crop to a region (absolute pixels) and/or magnify, so small text,
# menus, and icons stay legible. A full-monitor shot gets downscaled when viewed and
# loses fine detail; a tight crop keeps native pixels, and -Scale enlarges further.
powershell -File .claude/skills/app-explorer/control.ps1 -Action capture -RX 2190 -RY 505 -RW 400 -RH 400          # crop a 400x400 area
powershell -File .claude/skills/app-explorer/control.ps1 -Action capture -RX 2190 -RY 505 -RW 400 -RH 400 -Scale 2 # crop + 2x magnify

# ACT — locate your target in the PNG, then drive the app:
powershell -File .claude/skills/app-explorer/control.ps1 -Action move   -X 800 -Y 450
powershell -File .claude/skills/app-explorer/control.ps1 -Action click  -X 800 -Y 450
powershell -File .claude/skills/app-explorer/control.ps1 -Action double -X 800 -Y 450
powershell -File .claude/skills/app-explorer/control.ps1 -Action right  -X 800 -Y 450   # context menu
powershell -File .claude/skills/app-explorer/control.ps1 -Action middle -X 800 -Y 450
powershell -File .claude/skills/app-explorer/control.ps1 -Action drag   -X 100 -Y 100 -X2 400 -Y2 300
powershell -File .claude/skills/app-explorer/control.ps1 -Action scroll -Amount -3              # + up, - down
powershell -File .claude/skills/app-explorer/control.ps1 -Action scroll -Amount 3 -X 800 -Y 450 # scroll at a point

# Keyboard:
powershell -File .claude/skills/app-explorer/control.ps1 -Action type -Text "hello world"       # literal text
powershell -File .claude/skills/app-explorer/control.ps1 -Action key  -Keys "^s"                # Ctrl+S
powershell -File .claude/skills/app-explorer/control.ps1 -Action key  -Keys "{ENTER}"           # named key

# Where is the cursor right now? (useful to calibrate against a capture)
powershell -File .claude/skills/app-explorer/control.ps1 -Action cursorpos                       # prints "X,Y"

# CLEAN UP — delete the temp screenshots this skill saved (default %TEMP%\lumox-control-*.png).
# Run when you're done exploring so the captures don't pile up. Captures saved elsewhere
# via -Out are left untouched.
powershell -File .claude/skills/app-explorer/control.ps1 -Action cleanup
```

## How to explore reliably

- **Always capture before clicking.** Don't guess coordinates — find the target in
  a fresh PNG, click its centre, then capture again to verify what happened.
- **Capture in detail.** A full 1920/3840-wide shot is downscaled when viewed, so
  small text and menus blur. Take a first full capture to orient, then re-capture the
  specific panel/menu with `-RX -RY -RW -RH` (a tight crop keeps native pixels) and
  add `-Scale 2` to magnify fine text. Read the cropped PNG to confirm details.
- **Focus first — and keep it.** The app must be the foreground window. The
  integrated terminal / editor running these very commands tends to **steal
  foreground back between calls**, so a `click` you send in a separate step can
  land on the wrong window (and a `capture` can grab the terminal instead of the
  app). Two fixes that work:
  - **One command does activate → act → capture.** Resolve the target window's
    handle, `SetForegroundWindow`, then run the `control.ps1` click/capture in the
    *same* shell invocation so nothing slips in front between steps.
  - **For a sustained exploration, pin the window topmost.** `SetWindowPos(hwnd,
    HWND_TOPMOST=-1, …, SWP_NOMOVE|SWP_NOSIZE=0x0003)` keeps the app above the
    terminal so every capture shows it and every click lands. **Un-pin when done**
    (`HWND_NOTOPMOST=-2`) so you don't leave the user's window stuck on top.
    Resolve the handle via `Get-Process | ? { $_.MainWindowTitle -match '<App>' }`.
- **`type` vs `key`.** `-Text` types characters literally (special chars escaped for
  you). `-Keys` uses SendKeys syntax for modifiers/named keys: `^`=Ctrl, `%`=Alt,
  `+`=Shift — e.g. `^c`, `%{F4}`, `+{TAB}`, `{ENTER}`, `{ESC}`, `{TAB}`, `{DOWN}`.
- **Switch windows** with `key -Keys "%{TAB}"` (Alt+Tab) or click a taskbar item.
- **Back out safely.** `{ESC}` closes a menu/dialog you opened while probing.
- **Pace.** Each step settles ~40 ms; add `-Delay <ms>` to slow down for laggy apps.

## Notes

- DPI-aware: the script calls `SetProcessDPIAware()`, so on scaled displays the
  reported/captured/clicked pixels all agree. (A non-DPI-aware capture would be
  offset from where clicks land — that's why capture and control are one script.)
- This machine is dual-monitor (commonly 3840×1080 = two 1920×1080 side by side).
  A full capture stitches both; the right monitor's X starts near 1920. Pass
  `-Monitor 0` / `-Monitor 1` to grab just one — but `click` always uses
  whole-virtual-desktop coordinates, so add the monitor's X offset back if you
  located a target inside a single-monitor shot.
- Default capture output: `%TEMP%\lumox-control-<timestamp>.png`. Pass `-Out <path>`
  for a stable location (e.g. under `.captures/`). When finished, run `-Action cleanup`
  to delete the default-location captures (it won't touch files saved via `-Out`).
- This drives the **real** desktop: clicks and keystrokes affect whatever is in
  front. Confirm the intended window is focused before sending input, and prefer
  read-only probing (open menus, hover, page through) over actions that change the
  app's state.
