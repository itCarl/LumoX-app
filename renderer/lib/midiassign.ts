// Main-window MIDI assign overlay. While the MIDI window has assign mode on,
// every `[data-midi]` control gets a purple wash (CSS: body.midi-assign …). A
// capture-phase click reads the control's action descriptor(s) and sends them to
// main (pickTarget), swallowing the normal click so nothing is triggered. Esc
// cancels. The descriptor (e.g. "scene:<id>") is decoded into a typed action by
// the main-process registry — the renderer just forwards the tag string(s).

const { lumox } = window;

let active = false;

/** Action descriptors on a tagged element: the primary `data-midi` plus an
 *  optional alternate `data-midi-alt` of the other kind (e.g. a group tab =
 *  intensity range + flash trigger). Main resolves which to bind by message type. */
function descriptorsOf(el: HTMLElement): string[] {
  const d = el.dataset;
  return [d.midi, d.midiAlt].filter((s): s is string => !!s);
}

function onClickCapture(e: MouseEvent): void {
  if (!active) return;
  const el = (e.target as HTMLElement | null)?.closest('[data-midi]') as HTMLElement | null;
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  const descriptors = descriptorsOf(el);
  if (!descriptors.length) return;
  lumox.midi.pickTarget(descriptors);
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
