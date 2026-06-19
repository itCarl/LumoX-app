# Plans

Forward-looking design / implementation plans for features **not yet built**.

These are distinct from the knowledge base (`docs/knowledge-base/`), which is the
source of truth for **shipped** behaviour. When a plan ships, fold the relevant
parts into the knowledge base and update the table in `lumox-app/CLAUDE.md`.

| Plan | Scope |
| --- | --- |
| [feature-backlog.md](feature-backlog.md) | Surveyed capabilities to adopt (fixture index/selections, limitations, FX rack, cue semantics, timeline super-scenes, stand-alone, …), scored against Lumox today |
| [midi-control-surface.md](midi-control-surface.md) | App-level MIDI device management + action mapping + MIDI-learn + feedback, on top of the existing `src/midi/` engine stack |
| [midi-scene-mapping-apc.md](midi-scene-mapping-apc.md) | First concrete slice of the above — a separate MIDI window with click-to-assign ("just clicky") mapping, APC Mini MK2 only |
