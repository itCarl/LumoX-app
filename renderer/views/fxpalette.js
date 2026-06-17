// FX Palette tile (CONTROL view, top-right) — scene editor entry points.
// Visual stubs for now; wired up as the effect engine is exposed.

const FX_BUTTONS = [
  'STEPS', 'COLOR FX', 'CHASER FX', 'MOVE FX',
  'VALUE FX', 'CURVE FX', 'MAPPINGS', 'COLOR MAPPINGS',
];

export async function makeFxPaletteTile() {
  const tile = document.createElement('section');
  tile.className = 'tile fxpal-tile';
  tile.innerHTML = `
    <div class="tile-head fxpal-head">
      <span class="fxpal-title">New Scene</span>
      <button class="fxpal-play" title="Play">▶</button>
    </div>
    <div class="tile-body fxpal-grid">
      ${FX_BUTTONS.map((b) => `<button class="fx-btn" disabled>${b}</button>`).join('')}
      <button class="fx-btn fx-wide" disabled>SUPER SCENE</button>
    </div>`;
  return { tile };
}
