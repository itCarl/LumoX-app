// knob.ts — reusable rotary knob. Vertical pointer-drag adjusts the value
// (hold Shift for fine control); double-click resets to the default. Renders an
// SVG track + value arc + needle + readout, matching the app's crisp-SVG style.
// The value maps linearly across [min, max].

export interface KnobOpts {
  label: string;
  value: number;
  min?: number;
  max?: number;
  default?: number;
  disabled?: boolean;
  /** format the numeric value for the readout */
  format?: (v: number) => string;
  /** live, while dragging */
  onInput?: (v: number) => void;
  /** committed, on release / double-click reset */
  onChange?: (v: number) => void;
}

export interface KnobHandle {
  el: HTMLElement;
  set(value: number): void;
  setDisabled(disabled: boolean): void;
}

const A0 = 135;      // arc start angle (deg, screen coords: y down)
const SWEEP = 270;   // arc sweep (deg)
const CX = 22, CY = 22, R = 16;

function polar(deg: number, r = R): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function arc(a0: number, a1: number, r = R): string {
  const [x0, y0] = polar(a0, r);
  const [x1, y1] = polar(a1, r);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function makeKnob(o: KnobOpts): KnobHandle {
  const min = o.min ?? 0;
  const max = o.max ?? 1;
  const def = o.default ?? o.value;
  const fmt = o.format ?? ((v) => v.toFixed(2));
  let value = clamp(o.value);
  let disabled = !!o.disabled;

  function clamp(v: number): number { return Math.max(min, Math.min(max, v)); }
  function norm(): number { return max === min ? 0 : (value - min) / (max - min); }

  const el = document.createElement('div');
  el.className = 'knob';
  el.innerHTML = `
    <svg class="knob-dial" viewBox="0 0 44 44" width="44" height="44">
      <path class="knob-track" d="${arc(A0, A0 + SWEEP)}" fill="none"/>
      <path class="knob-val" fill="none"/>
      <line class="knob-needle" x1="${CX}" y1="${CY}"/>
    </svg>
    <div class="knob-label">${o.label}</div>
    <div class="knob-readout"></div>`;

  const valPath = el.querySelector('.knob-val') as SVGPathElement;
  const needle = el.querySelector('.knob-needle') as SVGLineElement;
  const readout = el.querySelector('.knob-readout') as HTMLElement;

  function draw(): void {
    const a = A0 + SWEEP * norm();
    valPath.setAttribute('d', arc(A0, a));
    const [nx, ny] = polar(a, R - 3);
    needle.setAttribute('x2', nx.toFixed(2));
    needle.setAttribute('y2', ny.toFixed(2));
    readout.textContent = fmt(value);
    el.classList.toggle('disabled', disabled);
  }

  // vertical drag → value
  let startY = 0, startVal = 0, dragging = false;
  el.addEventListener('pointerdown', (e) => {
    if (disabled) return;
    dragging = true;
    startY = e.clientY;
    startVal = value;
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const span = max - min;
    const px = e.shiftKey ? 600 : 180;   // pixels of drag for full travel
    value = clamp(startVal + ((startY - e.clientY) / px) * span);
    draw();
    o.onInput?.(value);
  });
  const end = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    o.onChange?.(value);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', () => {
    if (disabled) return;
    value = clamp(def);
    draw();
    o.onChange?.(value);
  });

  draw();
  return {
    el,
    set(v) { value = clamp(v); draw(); },
    setDisabled(d) { disabled = d; draw(); },
  };
}
