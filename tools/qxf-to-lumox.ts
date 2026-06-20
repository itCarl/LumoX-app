// `npm run port-qxf -- <srcFixturesDir> <vendor> [vendor...]` — batch-convert
// upstream `.qxf` fixture definitions into Lumox `.lumox.json` built-in profiles.
//
// The `.qxf` format is an open, community-maintained DMX fixture library
// (Apache-2.0) — the largest consistent source of fixture data. Both formats
// describe the same thing — an ordered list of channels per mode, each channel a
// semantic role plus value-range meanings — so the port is a structural
// translation driven by one preset/group → `typeId` table (see PRESET_MAP /
// resolveTypeId below).
//
// Only fixtures that pass FixtureValidator are written; anything that doesn't map
// cleanly is reported and skipped, so the bundled library always stays valid.
// Existing files are never overwritten (hand-authored profiles win).
//
//   npm run port-qxf -- ../fixture-src/resources/fixtures Eurolite Stairville
//
// Output lands in `fixtures/<Vendor>/<model-slug>.lumox.json`.

import { readdir, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { FixtureValidator } from '../src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = path.join(__dirname, '..', 'fixtures');
const STAMP = '2026-06-20T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Upstream channel-level Preset → Lumox typeId. Capability-level presets (ColorMacro,
// GoboMacro, Rotation*, Strobe*, …) are handled in mapCapabilities; the entries
// here also catch them when they appear as a whole channel's Preset.
// ---------------------------------------------------------------------------
const PRESET_MAP: Record<string, string> = {
  // intensity
  IntensityMasterDimmer: 'intensity-master', IntensityMasterDimmerFine: 'intensity-master-fine',
  IntensityDimmer: 'intensity', IntensityDimmerFine: 'intensity-fine',
  IntensityRed: 'red', IntensityRedFine: 'red-fine',
  IntensityGreen: 'green', IntensityGreenFine: 'green-fine',
  IntensityBlue: 'blue', IntensityBlueFine: 'blue-fine',
  IntensityWhite: 'white', IntensityWhiteFine: 'white-fine',
  IntensityAmber: 'amber', IntensityAmberFine: 'amber-fine',
  IntensityUV: 'uv', IntensityUVFine: 'uv-fine',
  IntensityCyan: 'cyan', IntensityCyanFine: 'cyan-fine',
  IntensityMagenta: 'magenta', IntensityMagentaFine: 'magenta-fine',
  IntensityYellow: 'yellow', IntensityYellowFine: 'yellow-fine',
  IntensityLime: 'lime', IntensityLimeFine: 'lime-fine',
  IntensityIndigo: 'indigo', IntensityIndigoFine: 'indigo-fine',
  IntensityHue: 'hue', IntensityHueFine: 'hue-fine',
  IntensitySaturation: 'saturation', IntensitySaturationFine: 'saturation-fine',
  IntensityLightness: 'lightness', IntensityLightnessFine: 'lightness-fine',
  IntensityValue: 'value', IntensityValueFine: 'value-fine',
  // position
  PositionPan: 'pan', PositionPanFine: 'pan-fine',
  PositionTilt: 'tilt', PositionTiltFine: 'tilt-fine',
  PositionXAxis: 'x-axis', PositionYAxis: 'y-axis',
  // pan/tilt movement speed
  SpeedPanTiltSlowFast: 'pan-tilt-speed-slow-fast', SpeedPanTiltFastSlow: 'pan-tilt-speed-fast-slow',
  SpeedPanSlowFast: 'pan-speed-slow-fast', SpeedPanFastSlow: 'pan-speed-fast-slow',
  SpeedTiltSlowFast: 'tilt-speed-slow-fast', SpeedTiltFastSlow: 'tilt-speed-fast-slow',
  // colour
  ColorMacro: 'color-wheel', ColorDoubleMacro: 'color-wheel', ColorWheel: 'color-wheel',
  ColorWheelFine: 'color-wheel-fine', ColorWheelIndex: 'color-wheel',
  ColorRGBMixer: 'color-rgb-mixer', ColorCTOMixer: 'cto-mixer', ColorCTCMixer: 'ctc-mixer', ColorCTBMixer: 'ctb-mixer',
  // gobo
  GoboWheel: 'gobo-wheel-1', GoboWheelFine: 'gobo-wheel-1-fine', GoboMacro: 'gobo-wheel-1',
  GoboShakeMacro: 'gobo-shake', GoboIndex: 'gobo-index', GoboIndexFine: 'gobo-index-fine',
  // shutter / strobe
  ShutterStrobeSlowFast: 'strobe', ShutterStrobeFastSlow: 'strobe',
  StrobeSlowToFast: 'strobe', StrobeFastToSlow: 'strobe', StrobeRandom: 'strobe',
  StrobeRandomSlowToFast: 'strobe', StrobeRandomFastToSlow: 'strobe',
  StrobeFreqRange: 'strobe', StrobeFrequency: 'strobe',
  PulseSlowToFast: 'strobe', PulseFastToSlow: 'strobe', PulseFreqRange: 'strobe', PulseFrequency: 'strobe',
  ShutterOpen: 'shutter', ShutterClose: 'shutter',
  ShutterIrisMinToMax: 'iris', ShutterIrisMaxToMin: 'iris', ShutterIrisFine: 'iris-fine',
  // beam
  BeamZoomSmallBig: 'zoom', BeamZoomBigSmall: 'zoom', BeamZoomFine: 'zoom-fine',
  BeamFocusNearFar: 'focus', BeamFocusFarNear: 'focus', BeamFocusFine: 'focus-fine',
  // prism
  PrismRotationSlowFast: 'prism-rotation-slow-fast', PrismRotationFastSlow: 'prism-rotation-fast-slow',
  PrismEffectOn: 'prism', PrismEffectOff: 'prism',
  // maintenance / control
  LampOn: 'lamp', LampOff: 'lamp', NoFunction: 'nothing',
  SilentModeOn: 'function', SilentModeOff: 'function', SilentModeAutomatic: 'function',
};

const COLOUR_TAG: Record<string, string> = {
  Red: 'red', Green: 'green', Blue: 'blue', Cyan: 'cyan', Magenta: 'magenta',
  Yellow: 'yellow', Amber: 'amber', White: 'white', UV: 'uv', Lime: 'lime', Indigo: 'indigo',
};

const TYPE_MAP: Record<string, string> = {
  'Moving Head': 'Moving Head', Scanner: 'Scanner',
  'LED Bar (Pixels)': 'LED Bar', 'LED Bar (Beams)': 'LED Bar',
  'Color Changer': 'Color Changer', Dimmer: 'Dimmer', Strobe: 'Strobe',
  Smoke: 'Smoke', Hazer: 'Smoke', Laser: 'Laser', Flower: 'Effect', Effect: 'Effect',
  Other: 'Other',
};

// ---------------------------------------------------------------------------

interface QxfChannel { '@_Name': string; '@_Preset'?: string; '@_Default'?: number;
  Group?: { '#text': string }[]; Colour?: string; Capability?: QxfCap[]; }
interface QxfCap { '@_Min': number; '@_Max': number; '@_Preset'?: string;
  '@_Res1'?: string | number; '@_Res2'?: string | number; '#text'?: string; }

const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '@_',
  parseAttributeValue: true, parseTagValue: false, trimValues: true,
  isArray: (n) => ['Channel', 'Mode', 'Capability', 'Head', 'Group'].includes(n),
});

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'fixture';
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(v);
const has = (s: string | undefined, re: RegExp): boolean => !!s && re.test(s);

function resolveTypeId(ch: QxfChannel): string {
  const preset = ch['@_Preset'];
  if (preset && PRESET_MAP[preset]) return PRESET_MAP[preset];
  const group = ch.Group?.[0]?.['#text'];
  const colour = ch.Colour;
  const name = ch['@_Name'] ?? '';
  const fine = /\bfine\b/i.test(name);

  if (colour && COLOUR_TAG[colour]) return COLOUR_TAG[colour] + (fine ? '-fine' : '');
  switch (group) {
    case 'Intensity':
      if (has(name, /master/i)) return fine ? 'intensity-master-fine' : 'intensity-master';
      return fine ? 'intensity-fine' : 'intensity';
    case 'Colour':
      if (has(name, /wheel/i)) return fine ? 'color-wheel-fine' : 'color-wheel';
      if (has(name, /\bcto\b/i)) return 'cto';
      if (has(name, /\bctb\b/i)) return 'ctb';
      return 'color-macro';
    case 'Gobo':
      if (has(name, /shake/i)) return 'gobo-shake';
      if (has(name, /rot|index|spin/i)) return has(name, /\b2\b|two/i) ? 'gobo-rotation-2' : 'gobo-rotation-1';
      return has(name, /\b2\b|two/i) ? 'gobo-wheel-2' : 'gobo-wheel-1';
    case 'Beam':
      if (has(name, /zoom/i)) return fine ? 'zoom-fine' : 'zoom';
      if (has(name, /focus/i)) return fine ? 'focus-fine' : 'focus';
      if (has(name, /iris/i)) return fine ? 'iris-fine' : 'iris';
      if (has(name, /frost/i)) return 'frost';
      if (has(name, /prism/i)) return 'prism';
      if (has(name, /blade|shutter.?[12]/i)) return has(name, /2/) ? 'blade-2' : 'blade-1';
      return 'function';
    case 'Prism':
      return has(name, /rot/i) ? 'prism-rotation' : 'prism';
    case 'Shutter':
      return has(name, /strob|pulse/i) ? 'strobe' : 'shutter';
    case 'Speed':
      if (has(name, /pan.*tilt|p\/?t|movement/i)) return 'pan-tilt-speed';
      if (has(name, /program|effect|macro|show|auto/i)) return 'effect-speed';
      return 'speed';
    case 'Effect':
      if (has(name, /sound|music|mic/i)) return 'sound';
      if (has(name, /macro|program|auto|show|mode|scene|chase/i)) return 'macro';
      return 'effect';
    case 'Maintenance':
      if (has(name, /reset/i)) return 'reset';
      if (has(name, /lamp|bulb/i)) return 'lamp';
      if (has(name, /fan|cool/i)) return 'fan';
      return 'function';
    case 'Pan': return fine ? 'pan-fine' : 'pan';
    case 'Tilt': return fine ? 'tilt-fine' : 'tilt';
    case 'Nothing': return 'nothing';
  }
  return 'function';
}

function shutterMode(preset: string | undefined, label: string): string {
  const t = `${preset ?? ''} ${label}`;
  if (/open/i.test(t)) return 'open';
  if (/close|black|shut/i.test(t)) return 'closed';
  if (/random/i.test(t)) return 'random';
  if (/pulse|ramp/i.test(t)) return 'pulse';
  return 'strobe';
}

function mapCapabilities(ch: QxfChannel, typeId: string): object[] {
  const caps = ch.Capability ?? [];
  // A single full-range linear cap carries no extra meaning — keep the channel clean.
  if (caps.length <= 1 && (caps.length === 0 || (caps[0]['@_Min'] === 0 && caps[0]['@_Max'] === 255)))
    return [];

  const group = ch.Group?.[0]?.['#text'];
  return caps.map((c) => {
    const min = c['@_Min'], max = c['@_Max'];
    const label = (c['#text'] ?? `${min}-${max}`).toString();
    const preset = c['@_Preset'];
    const res1 = c['@_Res1'];

    if (isHex(res1) || preset === 'ColorMacro' || preset === 'ColorDoubleMacro')
      return { kind: 'color', min, max, label, color: isHex(res1) ? res1 : '#ffffff' };
    if (typeId.startsWith('gobo') || group === 'Gobo')
      return { kind: 'gobo', min, max, label,
        image: typeof res1 === 'string' && !isHex(res1) ? res1 : null,
        shake: /shake/i.test(`${preset ?? ''} ${label}`) };
    if (typeId === 'strobe' || typeId === 'shutter' || group === 'Shutter')
      return { kind: 'shutter', min, max, label, mode: shutterMode(preset, label), rateHz: null };
    if (typeId === 'effect' || group === 'Effect')
      return { kind: 'effect', min, max, label, effectName: slug(label) };
    return { kind: 'range', min, max, label };
  });
}

function buildPhysical(phys: any): object | undefined {
  if (!phys) return undefined;
  const out: any = {};
  const d = phys.Dimensions, b = phys.Bulb, l = phys.Lens, f = phys.Focus, t = phys.Technical;
  if (d && (d['@_Width'] || d['@_Height'] || d['@_Depth']))
    out.dimensions = { width: +d['@_Width'] || 0, height: +d['@_Height'] || 0, depth: +d['@_Depth'] || 0, unit: 'mm' };
  if (d && +d['@_Weight'] > 0) out.weight = { value: +d['@_Weight'], unit: 'kg' };
  if (b && (b['@_Type'] || +b['@_Lumens'] > 0 || +b['@_ColourTemperature'] > 0))
    out.bulb = { type: b['@_Type'] || null, lumens: +b['@_Lumens'] || null, colourTemperature: +b['@_ColourTemperature'] || null };
  if (l && (l['@_Name'] || +l['@_DegreesMin'] > 0 || +l['@_DegreesMax'] > 0))
    out.lens = { name: l['@_Name'] || null, degreesMin: Math.min(360, +l['@_DegreesMin'] || 0), degreesMax: Math.min(360, +l['@_DegreesMax'] || 0) };
  if (f) out.focus = { type: f['@_Type'] || null, panMax: Math.min(720, +f['@_PanMax'] || 0), tiltMax: Math.min(720, +f['@_TiltMax'] || 0) };
  if (t && +t['@_PowerConsumption'] > 0) out.power = { consumption: +t['@_PowerConsumption'], unit: 'W' };
  return Object.keys(out).length ? out : undefined;
}

function convert(xml: string, srcFile: string): { manufacturer: string; def: any } | null {
  const root = parser.parse(xml)?.FixtureDefinition;
  if (!root) return null;
  const manufacturer = (root.Manufacturer ?? '').toString().trim();
  const model = (root.Model ?? '').toString().trim();
  if (!manufacturer || !model) return null;

  const channelDefs = new Map<string, QxfChannel>();
  for (const ch of (root.Channel ?? []) as QxfChannel[]) channelDefs.set(ch['@_Name'].toString().trim(), ch);

  const modesXml = (root.Mode ?? []) as any[];
  if (!modesXml.length) return null;

  const usedIds = new Set<string>();
  const modes: any[] = [];
  for (const m of modesXml) {
    const refs = ((m.Channel ?? []) as any[])
      .slice().sort((a, b) => (+a['@_Number']) - (+b['@_Number']));
    const channels = refs.map((r) => {
      const def = channelDefs.get((r['#text'] ?? '').toString().trim());
      if (!def) return null;
      const typeId = resolveTypeId(def);
      return { name: (def['@_Name'] ?? '').toString().trim(), typeId,
        defaultValue: +def['@_Default'] || 0, capabilities: mapCapabilities(def, typeId) };
    });
    if (channels.some((c) => c === null) || !channels.length || channels.length > 512) continue;

    let id = `${channels.length}ch`;
    for (let i = 2; usedIds.has(id); i++) id = `${channels.length}ch-${i}`;
    usedIds.add(id);
    modes.push({ id, name: (m['@_Name'] ?? id).toString().trim(), channels });
  }
  if (!modes.length) return null;

  // Definition-level physical: prefer the top-level block, else the first mode's.
  const physical = buildPhysical(root.Physical) ?? buildPhysical(modesXml[0]?.Physical);
  const author = (root.Creator?.Author ?? '').toString().trim() || null;

  const def: any = {
    id: `${manufacturer}/${model}`, manufacturer, model,
    type: TYPE_MAP[(root.Type ?? '').toString().trim()] ?? 'Other',
    meta: {
      author, version: '1.0.0', createdAt: STAMP, modifiedAt: STAMP,
      source: `Ported from an open-source DMX fixture library (Apache-2.0); source file ${path.basename(srcFile)}`,
      notes: 'Auto-converted from an open-source DMX fixture library. Verify channel order and capability ranges against your unit\'s firmware.',
    },
    ...(physical ? { physical } : {}),
    modes,
  };
  return { manufacturer, def };
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.qxf')) yield full;
  }
}

async function main() {
  const [srcDir, ...vendors] = process.argv.slice(2);
  if (!srcDir || !vendors.length) {
    console.error('usage: npm run port-qxf -- <srcFixturesDir> <vendor> [vendor...]');
    process.exit(2);
  }
  const validator = new FixtureValidator();
  let written = 0, skippedExisting = 0, invalid = 0, failed = 0;
  const problems: string[] = [];

  for (const vendor of vendors) {
    const vDir = path.join(srcDir, vendor);
    if (!(await exists(vDir))) { console.warn(`! vendor folder not found: ${vendor}`); continue; }

    for await (const file of walk(vDir)) {
      let result: { manufacturer: string; def: any } | null = null;
      try { result = convert(await readFile(file, 'utf8'), file); }
      catch (err: any) { failed++; problems.push(`${path.basename(file)}: parse — ${err.message}`); continue; }
      if (!result) { failed++; problems.push(`${path.basename(file)}: no usable manufacturer/model/modes`); continue; }

      const wrapper = { $schema: '../schema/lumox-fixture.schema.json', version: 1, definitions: [result.def] };
      const r = validator.validate(wrapper);
      if (!r.valid) { invalid++; problems.push(`${path.basename(file)}: ${r.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`); continue; }

      const outDir = path.join(OUT_ROOT, result.manufacturer);
      const outFile = path.join(outDir, `${slug(result.def.model)}.lumox.json`);
      if (await exists(outFile)) { skippedExisting++; continue; }
      await mkdir(outDir, { recursive: true });
      await writeFile(outFile, JSON.stringify(wrapper, null, 2) + '\n', 'utf8');
      written++;
    }
  }

  console.log('-'.repeat(60));
  console.log(`Written ${written} · skipped(existing) ${skippedExisting} · invalid ${invalid} · failed ${failed}`);
  if (problems.length) {
    console.log(`\nProblems (${problems.length}):`);
    for (const p of problems.slice(0, 40)) console.log(`  - ${p}`);
    if (problems.length > 40) console.log(`  … +${problems.length - 40} more`);
  }
}

main();
