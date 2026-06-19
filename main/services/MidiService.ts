// MidiService — the app-layer MIDI control surface. Owns the MidiManager, the
// connected device's input/output ports, the click-to-assign "learn" flow, the
// list of bindings, and the executor dispatch.
//
// Guiding rule (see docs/knowledge-base/midi.md): a MIDI message never knows what
// a scene is — it resolves to a Target and runs the SAME engine path the UI uses
// (`recallScene`, `grandMaster`, `blackout`, group intensity). So hardware
// behaves exactly like clicking: correct fades, one-active-per-bank, live gating.
//
// Devices are PLUGGABLE: everything controller-specific (port match, LED palette,
// LED animation protocol) lives in a `MidiDeviceProfile` (main/midi/profiles/).
// This service is written against that interface only — adding a controller means
// adding a profile, not editing this file. Unknown devices use the generic
// profile and still work for input (no LED feedback). The engine driver
// (`src/midi/`) stays untouched — this service listens to the raw input itself.

import { EventEmitter } from 'node:events';
import type { MidiManager } from '../../src/midi/MidiManager';
import type { MidiInput } from '../../src/midi/MidiInput';
import type { MidiOutput } from '../../src/midi/MidiOutput';
import { engine, show, recallScene, markLiveUniverse } from '../context';
import { midiManager } from './midi-backend';
import { selectDevice } from '../midi/profiles';
import type { MidiDeviceProfile, MidiCapabilities, LedMode } from '../midi/profiles';

export type MidiTargetKind = 'trigger' | 'range';

/** What a Lumox control IS — a stable, persistable handle plus UI metadata. */
export interface MidiTarget {
  key: string;                 // "scene:<id>", "group:<id>:intensity", "master", "blackout"
  label: string;               // human label for the mappings table
  kind: MidiTargetKind;        // button-like vs continuous
  min?: number;                // range bounds (range targets)
  max?: number;
}

/** What the hardware sends. */
export interface MidiTrigger {
  type: 'note' | 'cc';
  channel: number;
  number: number;              // note number / controller number
}

/** Per-binding behaviour tweaks, editable in the mappings table. */
export interface MidiBindingOptions {
  mode?: 'toggle' | 'flash';   // trigger targets
  invert?: boolean;            // range targets
  min?: number;                // range override (else target.min)
  max?: number;
  // LED feedback (note/pad bindings) — like QLC+'s per-assignment feedback, but
  // richer to match the APC MK2: a colour + how the pad behaves while ACTIVE.
  ledColor?: string;                       // MK2 palette name (see LED_VELOCITY)
  ledMode?: 'solid' | 'blink' | 'fade';    // active-state animation
}

export interface MidiBinding {
  id: string;
  trigger: MidiTrigger;
  target: MidiTarget;
  options: MidiBindingOptions;
}

export interface MidiStatus {
  connected: boolean;
  portName: string | null;
  deviceName: string | null;
  capabilities: MidiCapabilities;
}
export interface MidiMonitorMessage { type: 'note' | 'cc'; channel: number; number: number; value: number; }

const LED_POLL_MS = 400;       // refresh scene-pad LEDs by live state at this cadence
const newId = (): string => `mb_${Math.random().toString(36).slice(2, 9)}`;

/**
 * Events (consumed by handlers/midi.ts → broadcast to windows):
 *   'status'         MidiStatus
 *   'bindings'       MidiBinding[]            (UI refresh only)
 *   'assign-mode'    { active: boolean }      (→ main window overlay)
 *   'awaiting-input' { waiting, label? }      (→ MIDI window banner)
 *   'message'        MidiMonitorMessage       (live monitor)
 *   'dirty'                                    (a binding was learned — flag project)
 */
export class MidiService extends EventEmitter {
  private mgr: MidiManager;
  private input: MidiInput | null = null;
  private output: MidiOutput | null = null;
  private portName: string | null = null;
  private profile: MidiDeviceProfile | null = null;   // the matched device plugin

  private bindings: MidiBinding[] = [];
  private pendingTarget: MidiTarget | null = null;   // chosen control, waiting for a MIDI message
  private assignMode = false;

  private lit = new Map<number, string>();           // note → last LED "velocity,channel" sent
  private ledTimer: ReturnType<typeof setInterval> | null = null;

  // Uses the app's single shared MidiManager by default (one backend / one MIDI
  // clock across the app); an explicit manager can be injected for tests.
  constructor(mgr: MidiManager = midiManager) {
    super();
    this.mgr = mgr;
  }

  // ---- connection --------------------------------------------------------
  /** Pick a device profile for an available input port and open it (plus the
   *  device's output for LEDs, when it has them). Silently stays "disconnected"
   *  with no device / no `easymidi` backend. A specific profile wins over the
   *  generic fallback, so any controller connects but the APC also gets LEDs. */
  async connect(): Promise<void> {
    try {
      await this.mgr.ensureBackend();
      const inputs = await this.mgr.listInputs();
      const match = selectDevice(inputs);
      if (!match) { this.setStatus(null, null); return; }
      this.profile = match.profile;
      this.input = await this.mgr.openInput(match.portName);
      await this.input.open();
      // Only open an output for devices that actually drive LEDs.
      if (this.profile.palette.length) {
        const outName = await this.mgr.findPort('out', this.profile.portHint);
        if (outName) { this.output = await this.mgr.openOutput(outName); await this.output.open(); }
      }
      this.bindInput();
      this.setStatus(match.portName, this.profile);
      this.refreshLeds(true);
      if (!this.ledTimer) this.ledTimer = setInterval(() => this.refreshLeds(), LED_POLL_MS);
    } catch {
      this.setStatus(null, null);
    }
  }

  capabilities(): MidiCapabilities {
    return this.profile
      ? { deviceId: this.profile.id, palette: this.profile.palette, ledModes: this.profile.ledModes }
      : { deviceId: null, palette: [], ledModes: [] };
  }

  status(): MidiStatus {
    return {
      connected: !!this.input,
      portName: this.portName,
      deviceName: this.profile?.name ?? null,
      capabilities: this.capabilities(),
    };
  }

  private setStatus(portName: string | null, profile: MidiDeviceProfile | null): void {
    this.portName = portName;
    this.profile = profile;
    this.emit('status', this.status());
  }

  private bindInput(): void {
    if (!this.input) return;
    this.input.on('noteon',  (m: any) => this.onNote(m.note, m.velocity ?? 0, m.channel ?? 0));
    this.input.on('noteoff', (m: any) => this.onNote(m.note, 0, m.channel ?? 0));
    this.input.on('cc',      (m: any) => this.onCC(m.controller, m.value ?? 0, m.channel ?? 0));
  }

  // ---- incoming messages -------------------------------------------------
  private onNote(note: number, velocity: number, channel: number): void {
    this.emit('message', { type: 'note', channel, number: note, value: velocity } as MidiMonitorMessage);
    const on = velocity > 0;
    if (this.pendingTarget) { if (on) this.learn({ type: 'note', channel, number: note }); return; }
    for (const b of this.bindings) {
      if (b.trigger.type === 'note' && b.trigger.number === note && b.trigger.channel === channel) {
        this.dispatchTrigger(b, on);
      }
    }
  }

  private onCC(controller: number, value: number, channel: number): void {
    this.emit('message', { type: 'cc', channel, number: controller, value } as MidiMonitorMessage);
    if (this.pendingTarget) { this.learn({ type: 'cc', channel, number: controller }); return; }
    for (const b of this.bindings) {
      if (b.trigger.type === 'cc' && b.trigger.number === controller && b.trigger.channel === channel) {
        this.dispatchRange(b, value);
      }
    }
  }

  // ---- executor dispatch (route through the same paths the UI uses) -------
  private dispatchTrigger(b: MidiBinding, on: boolean): void {
    const mode = b.options.mode ?? 'toggle';
    const key = b.target.key;
    if (key.startsWith('scene:')) {
      const id = key.slice('scene:'.length);
      if (mode === 'flash') recallScene(id, on);
      else if (on) recallScene(id, !engine.scenes.isLive(id));
    } else if (key === 'blackout') {
      if (mode === 'flash') engine.blackout.set(on);
      else if (on) engine.blackout.toggle();
    }
    this.refreshLeds();
  }

  private dispatchRange(b: MidiBinding, raw: number): void {
    const min = b.options.min ?? b.target.min ?? 0;
    const max = b.options.max ?? b.target.max ?? 1;
    const norm = (b.options.invert ? 127 - raw : raw) / 127;
    const out = min + norm * (max - min);
    const key = b.target.key;
    if (key === 'master') {
      engine.grandMaster.setValue(out);
    } else if (key.startsWith('group:') && key.endsWith(':intensity')) {
      const gid = key.slice('group:'.length, key.length - ':intensity'.length);
      const g = show.groups.get(gid);
      if (g) {
        g.setIntensity(show.patch, Math.round(out));
        g.apply(show.patch, engine.universes);
        for (const fx of g.fixtures(show.patch)) markLiveUniverse(fx.universeId);
      }
    }
  }

  // ---- click-to-assign (learn) flow --------------------------------------
  beginAssign(): void {
    this.assignMode = true;
    this.pendingTarget = null;
    this.emit('assign-mode', { active: true });
    this.emit('awaiting-input', { waiting: false });
  }

  /** A Lumox control was clicked in the main window — now wait for a MIDI message. */
  pickTarget(target: MidiTarget): void {
    if (!this.assignMode || !target?.key) return;
    this.pendingTarget = target;
    this.emit('awaiting-input', { waiting: true, label: target.label });
  }

  cancelAssign(): void {
    this.assignMode = false;
    this.pendingTarget = null;
    this.emit('awaiting-input', { waiting: false });
    this.emit('assign-mode', { active: false });
  }

  /** The first MIDI message after a target was picked — create the binding. */
  private learn(trigger: MidiTrigger): void {
    const target = this.pendingTarget;
    if (!target) return;
    this.pendingTarget = null;
    this.assignMode = false;
    // Replace any binding already on this control (one trigger → one action).
    this.bindings = this.bindings.filter(
      (b) => !(b.trigger.type === trigger.type && b.trigger.number === trigger.number && b.trigger.channel === trigger.channel),
    );
    this.bindings.push({
      id: newId(),
      trigger,
      target,
      options: target.kind === 'range' ? {} : { mode: 'toggle' },
    });
    this.emit('assign-mode', { active: false });
    this.emit('awaiting-input', { waiting: false });
    this.emitBindings();
    this.emit('dirty');
    this.refreshLeds(true);
  }

  // ---- binding edits -----------------------------------------------------
  setBindingOptions(id: string, options: MidiBindingOptions): void {
    const b = this.bindings.find((x) => x.id === id);
    if (!b) return;
    b.options = { ...b.options, ...options };
    this.emitBindings();
  }

  removeBinding(id: string): void {
    const before = this.bindings.length;
    this.bindings = this.bindings.filter((b) => b.id !== id);
    if (this.bindings.length !== before) { this.emitBindings(); this.refreshLeds(true); }
  }

  // ---- persistence (project file) ----------------------------------------
  listBindings(): MidiBinding[] {
    return this.bindings.map((b) => ({ ...b, trigger: { ...b.trigger }, target: { ...b.target }, options: { ...b.options } }));
  }

  /** Restore bindings from a project, dropping any whose target no longer resolves. */
  loadBindings(arr: unknown): void {
    const list = Array.isArray(arr) ? arr : [];
    this.bindings = list
      .filter((b): b is MidiBinding => this.isBinding(b) && this.targetResolves(b.target.key))
      .map((b) => ({
        id: b.id || newId(),
        trigger: { type: b.trigger.type, channel: b.trigger.channel | 0, number: b.trigger.number | 0 },
        target: { key: b.target.key, label: b.target.label, kind: b.target.kind, min: b.target.min, max: b.target.max },
        options: b.options ?? {},
      }));
    this.emitBindings();
    this.refreshLeds(true);
  }

  private isBinding(b: any): b is MidiBinding {
    return !!b && b.trigger && (b.trigger.type === 'note' || b.trigger.type === 'cc')
      && b.target && typeof b.target.key === 'string';
  }

  private targetResolves(key: string): boolean {
    if (key === 'master' || key === 'blackout') return true;
    if (key.startsWith('scene:')) return !!show.scenes.get(key.slice('scene:'.length));
    if (key.startsWith('group:') && key.endsWith(':intensity')) {
      return !!show.groups.get(key.slice('group:'.length, key.length - ':intensity'.length));
    }
    return false;
  }

  private emitBindings(): void { this.emit('bindings', this.listBindings()); }

  // ---- LED feedback ------------------------------------------------------
  /** Whether a note binding's target is currently "on" (drives the active LED). */
  private isActive(key: string): boolean {
    if (key.startsWith('scene:')) return engine.scenes.isLive(key.slice('scene:'.length));
    if (key === 'blackout') return engine.blackout.active;
    return false;
  }

  /** Default LED colour for a binding when none is chosen — picked from the
   *  connected device's palette (blackout → red, else the first/"cyan" colour). */
  private defaultColor(key: string): string {
    const pal = this.profile?.palette ?? [];
    const want = key === 'blackout' ? 'red' : 'cyan';
    return pal.some((p) => p.name === want) ? want : (pal[0]?.name ?? want);
  }

  /**
   * Light note-bound pads via the device profile: the chosen colour with its
   * active animation (solid / blink / fade) while the target is on, or a dim
   * state while idle (so the pad still shows it's assigned). Diffs against the
   * last frame so only changed pads are sent (LED_POLL polls cheaply). Devices
   * with no LEDs (generic profile) produce no commands — a no-op.
   */
  refreshLeds(force = false): void {
    if (!this.output || !this.profile) return;
    const desired = new Map<number, string>();
    for (const b of this.bindings) {
      if (b.trigger.type !== 'note') continue;
      const cmd = this.profile.led(b.trigger.number, {
        colorName: b.options.ledColor ?? this.defaultColor(b.target.key),
        mode: (b.options.ledMode ?? 'solid') as LedMode,
        active: this.isActive(b.target.key),
      });
      if (cmd) desired.set(b.trigger.number, `${cmd.velocity},${cmd.channel}`);
    }
    for (const [note] of this.lit) if (!desired.has(note)) this.output.noteOn(note, 0, 0);
    for (const [note, sig] of desired) {
      if (!force && this.lit.get(note) === sig) continue;
      const [vel, ch] = sig.split(',').map(Number);
      this.output.noteOn(note, vel, ch);
    }
    this.lit = desired;
  }
}

// Single instance for the whole app (the main process has one of everything).
export const midiService = new MidiService();
export const listMidiBindings = (): MidiBinding[] => midiService.listBindings();
export const loadMidiBindings = (arr: unknown): void => midiService.loadBindings(arr);
