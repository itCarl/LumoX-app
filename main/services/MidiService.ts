// MidiService — the app-layer MIDI control surface. Owns the MidiManager, the
// connected device's input/output ports, the click-to-assign "learn" flow, the
// list of bindings, and the dispatch onto the Action registry (midiActions.ts).
//
// Guiding rule (see docs/knowledge-base/midi.md): a MIDI message never knows what
// a scene is — it carries an Action reference (`{ key, params }`) and runs the
// SAME engine path the UI uses (`recallScene`, `grandMaster`, `blackout`, …). So
// hardware behaves exactly like clicking: correct fades, one-active-per-bank, live
// gating. This service owns NONE of those operations — the registry does; the
// service only matches incoming messages to bindings and routes them there.
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
import { midiManager } from './midi-backend';
import { selectDevice } from '../midi/profiles';
import type { MidiDeviceProfile, MidiCapabilities, LedMode } from '../midi/profiles';
import {
  type MidiActionRef, type MidiActionKind,
  actionInfo, actionKind, actionResolves, actionDescribe, actionActive,
  runTrigger, applyRange, cleanupBinding, parseDescriptor,
} from './midiActions';

export type { MidiActionRef, MidiActionKind };

/** What the hardware sends. */
export interface MidiTrigger {
  type: 'note' | 'cc';
  channel: number;
  number: number;              // note number / controller number
}

/** Per-binding behaviour tweaks, editable in the mappings table. */
export interface MidiBindingOptions {
  mode?: 'toggle' | 'flash';   // trigger actions
  invert?: boolean;            // range actions (absolute)
  relative?: boolean;          // range actions — treat CC as a signed encoder delta
  min?: number;                // range override (else the action's default)
  max?: number;
  // LED feedback (note/pad bindings) — a colour + how the pad behaves while ACTIVE.
  ledColor?: string;                       // device palette name
  ledMode?: 'solid' | 'blink' | 'fade';    // active-state animation
}

/** Persisted binding — references an action; no cached label (computed live). */
export interface MidiBinding {
  id: string;
  trigger: MidiTrigger;
  action: MidiActionRef;
  options: MidiBindingOptions;
}

/** Binding as the renderer sees it: + the registry-computed label & kind. */
export interface MidiBindingView extends MidiBinding { label: string; kind: MidiActionKind; }

export interface MidiStatus {
  connected: boolean;
  portName: string | null;
  deviceName: string | null;
  capabilities: MidiCapabilities;
}
export interface MidiMonitorMessage { type: 'note' | 'cc'; channel: number; number: number; value: number; }

/** Live per-binding feedback the software mirrors (and the device LEDs reflect):
 *  triggers report `active` (lit), ranges report their current `value` (0..1). */
export interface MidiFeedback { id: string; active?: boolean; value?: number; }

const LED_POLL_MS = 400;       // refresh scene-pad LEDs by live state at this cadence
const newId = (): string => `mb_${Math.random().toString(36).slice(2, 9)}`;

/**
 * Events (consumed by handlers/midi.ts → broadcast to windows):
 *   'status'         MidiStatus
 *   'bindings'       MidiBindingView[]        (UI refresh only)
 *   'assign-mode'    { active: boolean }      (→ main window overlay)
 *   'awaiting-input' { waiting, label? }      (→ MIDI window banner)
 *   'message'        MidiMonitorMessage       (live monitor)
 *   'feedback'       MidiFeedback[]           (→ mappings-table live state mirror)
 *   'dirty'                                    (a binding was learned — flag project)
 */
export class MidiService extends EventEmitter {
  private mgr: MidiManager;
  private input: MidiInput | null = null;
  private output: MidiOutput | null = null;
  private portName: string | null = null;
  private profile: MidiDeviceProfile | null = null;   // the matched device plugin

  private bindings: MidiBinding[] = [];
  // Candidate actions for the clicked control (one or more — e.g. a group tab
  // offers both intensity[range] and flash[trigger]); learn() resolves which one
  // to bind from the message type (CC → range, note → trigger).
  private pendingRefs: MidiActionRef[] = [];
  private assignMode = false;

  private lit = new Map<number, string>();           // note → last LED "velocity,channel" sent
  private ledTimer: ReturnType<typeof setInterval> | null = null;
  private feedbackValue = new Map<string, number>();  // range binding id → last value (0..1); also the relative accumulator

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
    if (this.pendingRefs.length) { if (on) this.learn({ type: 'note', channel, number: note }); return; }
    for (const b of this.bindings) {
      if (b.trigger.type === 'note' && b.trigger.number === note && b.trigger.channel === channel) {
        this.dispatchTrigger(b, on);
      }
    }
  }

  private onCC(controller: number, value: number, channel: number): void {
    this.emit('message', { type: 'cc', channel, number: controller, value } as MidiMonitorMessage);
    if (this.pendingRefs.length) { this.learn({ type: 'cc', channel, number: controller }); return; }
    for (const b of this.bindings) {
      if (b.trigger.type === 'cc' && b.trigger.number === controller && b.trigger.channel === channel) {
        this.dispatchRange(b, value);
      }
    }
  }

  // ---- executor dispatch (route through the Action registry) -------------
  private dispatchTrigger(b: MidiBinding, on: boolean): void {
    runTrigger(b.action, on, b.options.mode ?? 'toggle', b.id);
    this.refreshLeds();
  }

  private dispatchRange(b: MidiBinding, raw: number): void {
    const def = actionInfo(b.action.key);
    const min = b.options.min ?? def?.min ?? 0;
    const max = b.options.max ?? def?.max ?? 1;
    let norm: number;
    if (b.options.relative) {
      // Signed two's-complement encoder delta: 1..63 = +1..+63, 65..127 = -63..-1.
      // Accumulate from the last value so a knob walks the range up/down.
      const delta = (raw < 64 ? raw : raw - 128) / 127;
      norm = clamp01((this.feedbackValue.get(b.id) ?? 0.5) + delta);
    } else {
      norm = (b.options.invert ? 127 - raw : raw) / 127;
    }
    this.feedbackValue.set(b.id, norm);   // mirror the effective position in the UI / seed the accumulator
    applyRange(b.action, min + norm * (max - min));
    this.emitFeedback();
  }

  // ---- click-to-assign (learn) flow --------------------------------------
  beginAssign(): void {
    this.assignMode = true;
    this.pendingRefs = [];
    this.emit('assign-mode', { active: true });
    this.emit('awaiting-input', { waiting: false });
  }

  /** A Lumox control was clicked in the main window — now wait for a MIDI message.
   *  Accepts one or more `data-midi` descriptors; learn() picks by message type. */
  pickTarget(descriptors: string | string[]): void {
    if (!this.assignMode) return;
    const list = (Array.isArray(descriptors) ? descriptors : [descriptors])
      .map((d) => parseDescriptor(d))
      .filter((r): r is MidiActionRef => !!r);
    if (!list.length) return;
    this.pendingRefs = list;
    this.emit('awaiting-input', { waiting: true, label: list.map((r) => actionDescribe(r)).join(' / ') });
  }

  cancelAssign(): void {
    this.assignMode = false;
    this.pendingRefs = [];
    this.emit('awaiting-input', { waiting: false });
    this.emit('assign-mode', { active: false });
  }

  /** The first MIDI message after a target was picked — create the binding. A CC
   *  binds the range candidate, a note the trigger candidate (else the first). */
  private learn(trigger: MidiTrigger): void {
    const cands = this.pendingRefs;
    if (!cands.length) return;
    const wantKind: MidiActionKind = trigger.type === 'cc' ? 'range' : 'trigger';
    const action = cands.find((r) => actionKind(r.key) === wantKind) ?? cands[0];
    this.pendingRefs = [];
    this.assignMode = false;
    // Replace any binding already on this control (one trigger → one action).
    this.bindings = this.bindings.filter(
      (b) => !(b.trigger.type === trigger.type && b.trigger.number === trigger.number && b.trigger.channel === trigger.channel),
    );
    this.bindings.push({
      id: newId(),
      trigger,
      action,
      options: actionKind(action.key) === 'range' ? {} : { mode: 'toggle' },
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
    const b = this.bindings.find((x) => x.id === id);
    if (!b) return;
    cleanupBinding(b.action, id);                      // release a held flash etc.
    this.feedbackValue.delete(id);
    this.bindings = this.bindings.filter((x) => x.id !== id);
    this.emitBindings();
    this.refreshLeds(true);
  }

  // ---- persistence (project file) ----------------------------------------
  /** Persist shape — pure binding, no computed label (stored in the project). */
  listBindings(): MidiBinding[] {
    return this.bindings.map((b) => ({
      id: b.id,
      trigger: { ...b.trigger },
      action: { key: b.action.key, params: { ...b.action.params } },
      options: { ...b.options },
    }));
  }

  /** Renderer shape — adds the registry-computed live label + kind per row. */
  bindingViews(): MidiBindingView[] {
    return this.listBindings().map((b) => ({
      ...b,
      label: actionDescribe(b.action),
      kind: actionKind(b.action.key) ?? 'trigger',
    }));
  }

  /** Restore bindings from a project, dropping any whose action no longer resolves. */
  loadBindings(arr: unknown): void {
    const list = Array.isArray(arr) ? arr : [];
    this.bindings = list
      .filter((b): b is MidiBinding => this.isBinding(b) && actionResolves(b.action))
      .map((b) => ({
        id: b.id || newId(),
        trigger: { type: b.trigger.type, channel: b.trigger.channel | 0, number: b.trigger.number | 0 },
        action: { key: b.action.key, params: { ...b.action.params } },
        options: b.options ?? {},
      }));
    this.feedbackValue.clear();
    this.emitBindings();
    this.refreshLeds(true);
  }

  private isBinding(b: any): b is MidiBinding {
    return !!b && b.trigger && (b.trigger.type === 'note' || b.trigger.type === 'cc')
      && b.action && typeof b.action.key === 'string' && actionKind(b.action.key) != null;
  }

  private emitBindings(): void { this.emit('bindings', this.bindingViews()); }

  // ---- feedback (device LEDs + the software mirror) ----------------------
  /** Per-binding live feedback streamed to the renderer (the software mirror of
   *  what the device shows): triggers → `active`, ranges → last value (0..1). */
  feedback(): MidiFeedback[] {
    return this.bindings.map((b) =>
      actionKind(b.action.key) === 'range'
        ? { id: b.id, value: this.feedbackValue.get(b.id) ?? 0 }
        : { id: b.id, active: actionActive(b.action, b.id) });
  }

  private emitFeedback(): void { this.emit('feedback', this.feedback()); }

  /** Default LED colour for a binding when none is chosen — picked from the
   *  connected device's palette (blackout → red, else the first/"cyan" colour). */
  private defaultColor(key: string): string {
    const pal = this.profile?.palette ?? [];
    const want = key === 'blackout.toggle' ? 'red' : 'cyan';
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
    this.emitFeedback();   // always mirror state to the software, even with no LED output
    if (!this.output || !this.profile) return;
    const desired = new Map<number, string>();
    for (const b of this.bindings) {
      if (b.trigger.type !== 'note') continue;
      const cmd = this.profile.led(b.trigger.number, {
        colorName: b.options.ledColor ?? this.defaultColor(b.action.key),
        mode: (b.options.ledMode ?? 'solid') as LedMode,
        active: actionActive(b.action, b.id),
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

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// Single instance for the whole app (the main process has one of everything).
export const midiService = new MidiService();
export const listMidiBindings = (): MidiBinding[] => midiService.listBindings();
export const loadMidiBindings = (arr: unknown): void => midiService.loadBindings(arr);
