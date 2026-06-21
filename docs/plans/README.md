# Plans

Forward-looking design / implementation plans for features **not yet built**.

Distinct from the knowledge base (`docs/knowledge-base/`), which is the source of
truth for **shipped** behaviour. When a feature ships, move its spec out of these
plans, fold the behaviour into the knowledge base, and update the tables in
`lumox-app/CLAUDE.md` + `backlog-summary.md`.

**Status:** eight features shipped (ordered selections, per-fixture limits, FX-layer
rack, colour palettes, cue semantics, settings store, BPM sources, audio-reactive input
— see the summary). The only **active** build is **Input mapping & MIDI-learn**.
**Matrix/strip fixtures**, **Stand-alone export** and **Touch interface & remote** are
**parked** at lowest priority.

| Plan | Scope |
| --- | --- |
| [backlog-summary.md](backlog-summary.md) | **Start here** — one-glance status table of every feature (shipped / active / parked) with effort + dependencies |
| [feature-backlog.md](feature-backlog.md) | Detailed specs for the **remaining** work only — Input mapping (active), and the parked Matrix/strip, Stand-alone export, Touch/remote |
| [midi-control-surface.md](midi-control-surface.md) | Input mapping design — app-level MIDI device management + action mapping + MIDI-learn + feedback, on the existing `src/midi/` engine stack |
| [midi-scene-mapping-apc.md](midi-scene-mapping-apc.md) | Input mapping first slice — a separate MIDI window with click-to-assign ("just clicky") mapping, APC Mini MK2 only |
