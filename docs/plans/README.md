# Plans

Forward-looking design / implementation plans for features **not yet built**.

Distinct from the knowledge base (`docs/knowledge-base/`), which is the source of
truth for **shipped** behaviour. When a feature ships, move its spec out of these
plans, fold the behaviour into the knowledge base, and update the tables in
`lumox-app/CLAUDE.md` + `backlog-summary.md`.

**Status:** 7 features shipped (F1–F4, F6, F8, F10 — see the summary). The only
**active** item is **F9** (MIDI input mapping & MIDI-learn). **F11 / F12 / F14** are
**parked** at lowest priority.

| Plan | Scope |
| --- | --- |
| [backlog-summary.md](backlog-summary.md) | **Start here** — one-glance status table of every feature (shipped / active / parked) with effort + dependencies |
| [feature-backlog.md](feature-backlog.md) | Detailed specs for the **remaining** work only — F9 (active) and the parked F11 / F12 / F14 |
| [midi-control-surface.md](midi-control-surface.md) | F9 design — app-level MIDI device management + action mapping + MIDI-learn + feedback, on the existing `src/midi/` engine stack |
| [midi-scene-mapping-apc.md](midi-scene-mapping-apc.md) | F9 first slice — a separate MIDI window with click-to-assign ("just clicky") mapping, APC Mini MK2 only |
