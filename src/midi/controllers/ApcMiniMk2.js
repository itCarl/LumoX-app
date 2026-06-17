import { MidiController } from './MidiController.js';
import { createLogger } from '../../util/logger.js';

const log = createLogger('ApcMiniMk2');

/**
 * AKAI APC Mini MK2 controller mapping.
 *
 * Note layout (channel 0 unless noted):
 *   8×8 RGB pad grid   notes 0..63   (bottom-left = 0, top-right = 63)
 *                                    row 0 is the bottom row
 *   Track row buttons  notes 100..107  (below the grid)
 *   Scene launch col   notes 112..119  (right of the grid, top = 112)
 *   Shift button       note 122
 *
 *   8 channel faders   CC 48..55     (left to right)
 *   Master fader       CC 56
 *
 * LED feedback (channel 0 = static color):
 *   Pads:      Note On with velocity = palette index. Channels 1..6 give
 *              blink/pulse animations (see APC Mini MK2 communication PDF).
 *   Track/Scene buttons: only support a small set of brightness levels —
 *              velocity 0 = off, velocity > 0 = on. We use red/green here.
 *
 * Default bindings (subclass / override as needed):
 *   Master fader (CC 56)      → GrandMaster (0..1)
 *   Channel faders (CC 48..55) → first 8 groups' intensity by sorted id
 *                                 (falls back to scene track opacity if no groups)
 *   Scene buttons 112..119    → 8 utility actions:
 *       112 (top)  = Blackout toggle
 *       113        = All groups to full intensity
 *       114        = All groups to half intensity
 *       115        = All groups OFF
 *       116        = Reset GM to 1.0
 *       117..119   = Reserved (lit red, no-op by default)
 *   Track buttons 100..107    → bound to groups 1..8 (toggle "flash 100%")
 *   Pads                       → user-bindable via `bindPad(note, fn)`
 *                                 LED off by default
 *   Shift (122)                → modifier flag (`this.shift`)
 */
export class ApcMiniMk2 extends MidiController {
  static NAME = 'AKAI APC Mini MK2';
  static DEFAULT_PORT_HINT = 'APC mini mk2';     // substring match

  // ---- LED palette (subset; full table in MK2 protocol doc) -----------
  static COLOR = {
    off:    0,
    white:  3,
    red:    5,
    orange: 9,
    yellow: 13,
    green:  21,
    cyan:   37,
    blue:   45,
    purple: 53,
    pink:   57,
  };

  constructor(opts) {
    super(opts);
    this.shift = false;
    this._padBindings = new Map();      // note → { press, release, color }
    this._lastFaderValue = new Map();   // cc → last raw value
  }

  /** Bind a custom action to a pad. `color` lights the pad. */
  bindPad(note, { press, release, color = ApcMiniMk2.COLOR.white } = {}) {
    if (note < 0 || note > 63) throw new Error('pad note must be 0..63');
    this._padBindings.set(note, { press, release, color });
    this._setPadColor(note, color);
  }

  unbindPad(note) {
    this._padBindings.delete(note);
    this._setPadColor(note, ApcMiniMk2.COLOR.off);
  }

  /** Bind a row/column of pads to scenes from `engine.scenes` (SceneMixer). */
  bindScenesRow(row, sceneIds, color = ApcMiniMk2.COLOR.cyan) {
    if (row < 0 || row > 7) throw new Error('row must be 0..7');
    sceneIds.slice(0, 8).forEach((sid, i) => {
      const note = row * 8 + i;
      this.bindPad(note, {
        press: () => this.engine.scenes?.setOpacity?.(sid, 1),
        release: () => this.engine.scenes?.setOpacity?.(sid, 0),
        color,
      });
    });
  }

  // ---- handler binding -----------------------------------------------
  _bindHandlers() {
    this._on('noteon',  (m) => this._onNoteOn(m));
    this._on('noteoff', (m) => this._onNoteOff(m));
    this._on('cc',      (m) => this._onCC(m));
  }

  _onNoteOn({ note, velocity }) {
    if (velocity === 0) return this._onNoteOff({ note });
    // Pads
    if (note >= 0 && note <= 63) {
      const b = this._padBindings.get(note);
      if (b) {
        try { b.press?.(); } catch (e) { log.error('pad press:', e.message); }
        this._setPadColorChannel(note, b.color, 2);  // pulse while held
      }
      return;
    }
    // Track buttons
    if (note >= 100 && note <= 107) {
      const i = note - 100;
      this._onTrackPress(i);
      this._setTrackLed(i, ApcMiniMk2.COLOR.green);
      return;
    }
    // Scene launch
    if (note >= 112 && note <= 119) {
      const i = note - 112;
      this._onScenePress(i);
      this._setSceneLed(i, ApcMiniMk2.COLOR.red);   // brighten while held
      return;
    }
    // Shift
    if (note === 122) { this.shift = true; return; }
  }

  _onNoteOff({ note }) {
    if (note >= 0 && note <= 63) {
      const b = this._padBindings.get(note);
      if (b) {
        try { b.release?.(); } catch (e) { log.error('pad release:', e.message); }
        this._setPadColor(note, b.color);   // back to static
      }
      return;
    }
    if (note >= 100 && note <= 107) {
      const i = note - 100;
      this._onTrackRelease(i);
      // Track LED reflects bound-group existence
      const has = this._groupByIndex(i) != null;
      this._setTrackLed(i, has ? ApcMiniMk2.COLOR.green : ApcMiniMk2.COLOR.off);
      return;
    }
    if (note >= 112 && note <= 119) {
      this._refreshSceneLed(note - 112);
      return;
    }
    if (note === 122) { this.shift = false; return; }
  }

  _onCC({ controller, value }) {
    // Faders are CC 48..56. Value 0..127.
    if (controller >= 48 && controller <= 55) {
      const idx = controller - 48;     // 0..7
      const norm = value / 127;
      const g = this._groupByIndex(idx);
      if (g && this.patch) {
        g.setIntensity(this.patch, Math.round(norm * 255));
        g.apply(this.patch, this.engine.universes);
      }
      this._lastFaderValue.set(controller, value);
      return;
    }
    if (controller === 56) {
      this.engine.grandMaster.setValue(value / 127);
      return;
    }
  }

  _onScenePress(i) {
    switch (i) {
      case 0: this.engine.blackout.toggle(); break;
      case 1: this._allGroups((g) => g.setIntensity(this.patch, 255)); break;
      case 2: this._allGroups((g) => g.setIntensity(this.patch, 128)); break;
      case 3: this._allGroups((g) => g.setIntensity(this.patch, 0));   break;
      case 4: this.engine.grandMaster.setValue(1.0); break;
      // 5..7 reserved — extend by overriding _onScenePress in a subclass
      default: break;
    }
  }

  _onTrackPress(i) {
    // Flash-to-100% on a group while held — release restores
    const g = this._groupByIndex(i);
    if (!g || !this.patch) return;
    g._mk2Saved = g.fixtures(this.patch).map((fx) => fx.get('intensity'));
    g.setIntensity(this.patch, 255);
    g.apply(this.patch, this.engine.universes);
  }
  _onTrackRelease(i) {
    const g = this._groupByIndex(i);
    if (!g || !this.patch || !g._mk2Saved) return;
    g.fixtures(this.patch).forEach((fx, k) => fx.set('intensity', g._mk2Saved[k] ?? 0));
    g.apply(this.patch, this.engine.universes);
    g._mk2Saved = null;
  }

  // ---- LED helpers ----------------------------------------------------
  _setPadColor(note, color) {
    this.output?.noteOn(note, color & 0x7f, 0);
  }
  _setPadColorChannel(note, color, ch = 0) {
    // MK2 uses MIDI channel to select animation: 0 static, 1..6 various blinks/pulses.
    this.output?.noteOn(note, color & 0x7f, ch & 0x0f);
  }
  _setTrackLed(i, color) {
    this.output?.noteOn(100 + i, color & 0x7f, 0);
  }
  _setSceneLed(i, color) {
    this.output?.noteOn(112 + i, color & 0x7f, 0);
  }

  _refreshSceneLed(i) {
    // Default scene utility colors
    const defaults = [
      ApcMiniMk2.COLOR.red,    // 0 blackout
      ApcMiniMk2.COLOR.green,  // 1 full
      ApcMiniMk2.COLOR.yellow, // 2 half
      ApcMiniMk2.COLOR.orange, // 3 off
      ApcMiniMk2.COLOR.white,  // 4 GM reset
      ApcMiniMk2.COLOR.purple, // 5
      ApcMiniMk2.COLOR.pink,   // 6
      ApcMiniMk2.COLOR.cyan,   // 7
    ];
    this._setSceneLed(i, defaults[i] ?? ApcMiniMk2.COLOR.white);
  }

  _initLeds() {
    if (!this.output) return;
    // All off first
    this._allLedsOff();
    // Scene utility colors
    for (let i = 0; i < 8; i++) this._refreshSceneLed(i);
    // Track buttons green where a group is bound to that slot
    for (let i = 0; i < 8; i++) {
      const has = this._groupByIndex(i) != null;
      this._setTrackLed(i, has ? ApcMiniMk2.COLOR.green : ApcMiniMk2.COLOR.off);
    }
    // Pads from bindings (if any pre-set)
    for (const [note, b] of this._padBindings) this._setPadColor(note, b.color);
  }

  _allLedsOff() {
    if (!this.output) return;
    for (let i = 0; i < 64; i++)  this._setPadColor(i, 0);
    for (let i = 0; i < 8; i++)   this._setTrackLed(i, 0);
    for (let i = 0; i < 8; i++)   this._setSceneLed(i, 0);
  }

  // ---- helpers --------------------------------------------------------
  _allGroups(fn) {
    if (!this.groups || !this.patch) return;
    for (const g of this.groups.list()) {
      fn(g);
      g.apply(this.patch, this.engine.universes);
    }
  }

  /** Group at slot index 0..7 — sorted by group id for stable mapping. */
  _groupByIndex(i) {
    if (!this.groups) return null;
    const sorted = this.groups.list().sort((a, b) => a.id.localeCompare(b.id));
    return sorted[i] ?? null;
  }
}
