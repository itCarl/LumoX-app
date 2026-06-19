// Main-window MIDI assign overlay. While the MIDI window has assign mode on,
// every `[data-midi]` control gets a purple wash (CSS: body.midi-assign …). A
// capture-phase click reads the control's target descriptor and sends it to main
// (pickTarget), swallowing the normal click so nothing is triggered. Esc cancels.

import type { MidiTarget } from '../lumox';

const { lumox } = window;

let active = false;

/** Read a Lumox target descriptor from a tagged element's data-* attributes. */
function targetOf(el: HTMLElement): MidiTarget | null {
  const key = el.dataset.midi;
  if (!key) return null;
  const kind = (el.dataset.midiKind as 'trigger' | 'range') || 'trigger';
  const target: MidiTarget = { key, label: el.dataset.midiLabel || key, kind };
  if (kind === 'range') {
    if (el.dataset.midiMin != null) target.min = Number(el.dataset.midiMin);
    if (el.dataset.midiMax != null) target.max = Number(el.dataset.midiMax);
  }
  return target;
}

function onClickCapture(e: MouseEvent): void {
  if (!active) return;
  const el = (e.target as HTMLElement | null)?.closest('[data-midi]') as HTMLElement | null;
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  const t = targetOf(el);
  if (!t) return;
  lumox.midi.pickTarget(t);
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
