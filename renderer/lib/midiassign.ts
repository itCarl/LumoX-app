// Main-window MIDI assign overlay. While the MIDI window has assign mode on,
// every `[data-midi]` control gets a purple wash (CSS: body.midi-assign …). A
// capture-phase click reads the control's target descriptor and sends it to main
// (pickTarget), swallowing the normal click so nothing is triggered. Esc cancels.

import type { MidiTarget } from '../lumox';

const { lumox } = window;

let active = false;

/** Build a MidiTarget from a key + its kind/label/min/max strings. */
function makeTarget(key?: string, kind?: string, label?: string, min?: string, max?: string): MidiTarget | null {
  if (!key) return null;
  const k = (kind as 'trigger' | 'range') || 'trigger';
  const target: MidiTarget = { key, label: label || key, kind: k };
  if (k === 'range') {
    if (min != null) target.min = Number(min);
    if (max != null) target.max = Number(max);
  }
  return target;
}

/** Candidate targets on a tagged element: the primary `data-midi*` plus an optional
 *  alternate `data-midi-alt*` of the other kind (e.g. a group tab = intensity range
 *  + flash trigger). Main resolves which to bind from the learned message type. */
function targetsOf(el: HTMLElement): MidiTarget[] {
  const d = el.dataset;
  return [
    makeTarget(d.midi, d.midiKind, d.midiLabel, d.midiMin, d.midiMax),
    makeTarget(d.midiAlt, d.midiAltKind, d.midiAltLabel, d.midiAltMin, d.midiAltMax),
  ].filter((t): t is MidiTarget => !!t);
}

function onClickCapture(e: MouseEvent): void {
  if (!active) return;
  const el = (e.target as HTMLElement | null)?.closest('[data-midi]') as HTMLElement | null;
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  const targets = targetsOf(el);
  if (!targets.length) return;
  lumox.midi.pickTarget(targets);
  document.querySelectorAll('.midi-picked').forEach((n) => n.classList.remove('midi-picked'));
  el.classList.add('midi-picked');
}

export function initMidiAssign(): void {
  document.addEventListener('click', onClickCapture, true);   // capture phase — beat the control's own handlers
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active) lumox.midi.cancelAssign(); });
  lumox.midi.onAssignMode((m) => {
    active = m.active;
    document.body.classList.toggle('midi-assign', active);
    if (!active) document.querySelectorAll('.midi-picked').forEach((n) => n.classList.remove('midi-picked'));
  });
}
