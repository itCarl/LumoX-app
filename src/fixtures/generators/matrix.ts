// Matrix / strip fixture generator — builds a single multi-cell RGB(W) fixture
// definition from a width × height grid. Each cell is one emitter (R/G/B[/W],
// optional per-cell dimmer); the whole fixture can carry one master dimmer.
//
// The produced definition is the normal multi-cell shape the engine already
// consumes: `emitterLayout` positions every cell in normalized 0..1 space and
// `mode.emitters` groups the channels per cell, so MATRIX FX pixel-map across it
// out of the box (see docs/knowledge-base/mix-engine.md). It's plain JSON, saved
// through the regular `lumox:library:add` path as a Custom fixture.

import type { FixtureDefinitionJSON } from '../FixtureDefinition';
import type { ChannelJSON } from '../ChannelDefinition';
import type { EmitterCell } from '../FixtureDefinition';

/** DMX universe size — a generated fixture's channels must fit one universe. */
const MAX_CHANNELS = 512;
/** Mirrors FixtureDefinition's emitter cap. */
const MAX_CELLS = 1024;
/** Per-axis cell cap — keeps the grid sane and the preview cheap. */
const MAX_SIDE = 64;

export interface MatrixGenOptions {
  /** 'matrix' = width × height grid; 'strip' = a single row of `width` cells. */
  shape: 'matrix' | 'strip';
  /** Cells across (columns). For a strip this is the pixel count. */
  width: number;
  /** Cells down (rows). Forced to 1 for a strip. */
  height: number;
  /** Per-cell colour: RGB or RGBW. */
  color: 'rgb' | 'rgbw';
  /** Add a dimmer channel to every cell. */
  cellDimmer?: boolean;
  /** Add one leading master-dimmer channel for the whole fixture. */
  masterDimmer?: boolean;
  /** Optional model name; defaults to e.g. "Matrix 10x5 RGB". */
  name?: string;
}

function ch(name: string, typeId: string, defaultValue = 0): ChannelJSON {
  return { name, typeId, defaultValue };
}

/**
 * Build a multi-cell matrix/strip fixture definition. Throws on out-of-range
 * input (the caller surfaces the message). Cells are laid out row-major
 * (top-left → right, then down); channels follow the same cell order, so
 * `emitterLayout[k]` and `mode.emitters[k]` describe the same cell.
 */
export function buildMatrixDefinition(opts: MatrixGenOptions): FixtureDefinitionJSON {
  const strip = opts.shape === 'strip';
  const cols = Math.floor(opts.width);
  const rows = strip ? 1 : Math.floor(opts.height);
  const rgbw = opts.color === 'rgbw';
  const cellDimmer = !!opts.cellDimmer;
  const masterDimmer = !!opts.masterDimmer;

  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1) {
    throw new Error('Width and height must be at least 1.');
  }
  if (cols > MAX_SIDE || rows > MAX_SIDE) {
    throw new Error(`Width and height must be ${MAX_SIDE} or fewer.`);
  }
  const cells = cols * rows;
  if (cells > MAX_CELLS) throw new Error(`Too many cells (${cells}); max is ${MAX_CELLS}.`);

  const perCell = 3 + (rgbw ? 1 : 0) + (cellDimmer ? 1 : 0);
  const total = (masterDimmer ? 1 : 0) + cells * perCell;
  if (total > MAX_CHANNELS) {
    throw new Error(`${cells} cells × ${perCell}ch${masterDimmer ? ' + master' : ''} = ${total}ch exceeds the ${MAX_CHANNELS}-channel universe.`);
  }

  const channels: ChannelJSON[] = [];
  if (masterDimmer) channels.push(ch('Master Dimmer', 'intensity-master', 255));

  const layout: EmitterCell[] = [];
  const emitters: number[][] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = row * cols + col + 1;
      const base = channels.length; // channels added so far → this cell's first index-1
      channels.push(ch(`Cell ${cell} Red`, 'red'), ch(`Cell ${cell} Green`, 'green'), ch(`Cell ${cell} Blue`, 'blue'));
      if (rgbw) channels.push(ch(`Cell ${cell} White`, 'white'));
      if (cellDimmer) channels.push(ch(`Cell ${cell} Dimmer`, 'intensity', 255));
      // 1-based channel indices for this cell's group (R,G,B[,W][,Dim]).
      const group: number[] = [];
      for (let k = 0; k < perCell; k++) group.push(base + 1 + k);
      emitters.push(group);
      layout.push({ x: cols > 1 ? col / (cols - 1) : 0.5, y: rows > 1 ? row / (rows - 1) : 0.5 });
    }
  }

  const colorLabel = rgbw ? 'RGBW' : 'RGB';
  const model = (opts.name?.trim()) ||
    (strip ? `Strip ${cols} ${colorLabel}` : `Matrix ${cols}x${rows} ${colorLabel}`);
  const modeName = `${total}ch`;

  return {
    manufacturer: 'Custom',
    model,
    type: strip ? 'LED Bar' : 'LED Matrix',
    emitterLayout: layout,
    meta: {
      notes: `Generated ${strip ? `${cols}-cell strip` : `${cols}×${rows} matrix`} (${cells} cells, ${colorLabel}${cellDimmer ? ' + per-cell dimmer' : ''}${masterDimmer ? ' + master dimmer' : ''}).`,
    },
    modes: [{ name: modeName, channels, emitters }],
  };
}
