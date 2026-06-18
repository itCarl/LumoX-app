import { FixtureImporter, ImporterRegistry } from './Importer';
import { FixtureDefinition } from '../FixtureDefinition';
import type { FixtureMeta, FixturePhysical } from '../FixtureDefinition';
import { FixtureMode } from '../FixtureMode';
import { ChannelDefinition } from '../ChannelDefinition';
import { ChannelTypeRegistry } from '../ChannelType';
import {
  Capability, ColorCapability, GoboCapability, ShutterCapability,
} from '../Capability';

/** A matched `<tag>...</tag>` block: its open tag plus inner body. */
interface XmlBlock {
  openTag: string;
  body: string;
}

/**
 * QlcPlusImporter — parses QLC+ 5 `.qxf` fixture files.
 *
 * QLC+ 5 XML maps loosely to our model:
 *   <FixtureDefinition>
 *     <Manufacturer/> <Model/> <Type/>
 *     <Channel Name="..."> <Group Byte="0">Intensity</Group> ...
 *       <Capability Min="0" Max="9">Closed</Capability>
 *     </Channel>
 *     <Mode Name="Standard"> <Channel Number="0">Red</Channel> ... </Mode>
 *   </FixtureDefinition>
 *
 * This impl uses a minimal regex-based XML extractor — no DOMParser
 * dependency. Good enough for the QLC+ subset we care about; swap for
 * a real parser later if exotic profiles break.
 *
 * Group → ChannelType id mapping is in `mapQlcGroup` below; extend it as
 * needed (and contribute back).
 */
export class QlcPlusImporter extends FixtureImporter {
  static FORMAT = 'qlc+5';
  static EXTENSIONS = ['.qxf'];

  parse(input: string | Buffer): FixtureDefinition[] {
    const xml = Buffer.isBuffer(input) ? input.toString('utf8') : input;

    const manufacturer = textTag(xml, 'Manufacturer') ?? 'Unknown';
    const model        = textTag(xml, 'Model')        ?? 'Unknown';
    const type         = textTag(xml, 'Type')         ?? 'Other';

    // Creator block → meta
    const meta: FixtureMeta = {};
    const creatorBlock = findBlocks(xml, 'Creator')[0]?.body;
    if (creatorBlock) {
      meta.author  = textTag(creatorBlock, 'Author')  ?? null;
      meta.version = textTag(creatorBlock, 'Version') ?? '1.0.0';
      meta.source  = 'QLC+5 import';
    }

    // Physical block (top-level or inside Mode — we read top-level only)
    const physical = parsePhysical(findBlocks(xml, 'Physical')[0]?.body);

    // Parse top-level <Channel> defs into Map<name, ChannelDefinition>
    const channelMap = new Map<string, ChannelDefinition>();
    for (const block of findBlocks(xml, 'Channel')) {
      const name = attr(block.openTag, 'Name') ?? '';
      const groupTag = innerTag(block.body, 'Group');
      const groupName = groupTag?.text ?? 'Nothing';
      const byte = parseInt(attr(groupTag?.openTag ?? '', 'Byte') ?? '0', 10);

      const typeId = mapQlcGroup(groupName, byte, name);
      if (!ChannelTypeRegistry.has(typeId)) continue;

      const caps: Capability[] = [];
      for (const cap of findBlocks(block.body, 'Capability')) {
        const min = parseInt(attr(cap.openTag, 'Min') ?? '0', 10);
        const max = parseInt(attr(cap.openTag, 'Max') ?? '0', 10);
        const label = decode(cap.body.trim());
        caps.push(buildCapability(groupName, name, min, max, label, cap.openTag));
      }

      channelMap.set(name, new ChannelDefinition({
        name, typeId, capabilities: caps,
      }));
    }

    // Parse <Mode> blocks
    const modes: FixtureMode[] = [];
    for (const mBlock of findBlocks(xml, 'Mode')) {
      const modeName = attr(mBlock.openTag, 'Name') ?? 'Mode';
      const channels: ChannelDefinition[] = [];
      for (const ch of findBlocks(mBlock.body, 'Channel')) {
        const num = parseInt(attr(ch.openTag, 'Number') ?? '0', 10);
        const ref = decode(ch.body.trim());
        const def = channelMap.get(ref);
        if (def) channels[num] = def;
      }
      // fill holes with `nothing` channels
      for (let i = 0; i < channels.length; i++) {
        if (!channels[i]) channels[i] = new ChannelDefinition({ typeId: 'nothing', name: '—' });
      }
      modes.push(new FixtureMode({ id: modeName, name: modeName, channels }));
    }

    return [new FixtureDefinition({
      manufacturer, model, type, modes, meta, physical,
    })];
  }
}

function parsePhysical(block: string | undefined): FixturePhysical {
  if (!block) return {};
  const out: FixturePhysical = {};
  const dims = findBlocks(block, 'Dimensions')[0]?.openTag;
  if (dims) {
    out.dimensions = {
      width:  num(attr(dims, 'Width')),
      height: num(attr(dims, 'Height')),
      depth:  num(attr(dims, 'Depth')),
      unit: 'mm',
    };
    const w = num(attr(dims, 'Weight'));
    if (w != null) out.weight = { value: w, unit: 'kg' };
  }
  const bulb = findBlocks(block, 'Bulb')[0]?.openTag;
  if (bulb) {
    out.bulb = {
      type: attr(bulb, 'Type'),
      lumens: num(attr(bulb, 'Lumens')),
      colourTemperature: num(attr(bulb, 'ColourTemperature')),
    };
  }
  const lens = findBlocks(block, 'Lens')[0]?.openTag;
  if (lens) {
    out.lens = {
      name: attr(lens, 'Name'),
      degreesMin: num(attr(lens, 'DegreesMin')),
      degreesMax: num(attr(lens, 'DegreesMax')),
    };
  }
  const focus = findBlocks(block, 'Focus')[0]?.openTag;
  if (focus) {
    out.focus = {
      type: attr(focus, 'Type'),
      panMax: num(attr(focus, 'PanMax')),
      tiltMax: num(attr(focus, 'TiltMax')),
    };
  }
  const tech = findBlocks(block, 'Technical')[0]?.openTag;
  if (tech) {
    const p = num(attr(tech, 'PowerConsumption'));
    if (p != null) out.power = { consumption: p, unit: 'W' };
  }
  return out;
}

function num(s: string | null): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

ImporterRegistry.register(QlcPlusImporter);

// ---- QLC+ group → ChannelType id ----------------------------------------
function mapQlcGroup(group: string, byte: number, name: string): string {
  const n = (name ?? '').toLowerCase();
  switch (group) {
    case 'Intensity':
      if (/red/.test(n))     return byte === 1 ? 'red-fine'   : 'red';
      if (/green/.test(n))   return byte === 1 ? 'green-fine' : 'green';
      if (/blue/.test(n))    return byte === 1 ? 'blue-fine'  : 'blue';
      if (/white/.test(n))   return byte === 1 ? 'white-fine' : 'white';
      if (/amber/.test(n))   return 'amber';
      if (/u\.?v/.test(n))   return 'uv';
      if (/lime/.test(n))    return 'lime';
      if (/cyan/.test(n))    return 'cyan';
      if (/magenta/.test(n)) return 'magenta';
      if (/yellow/.test(n))  return 'yellow';
      return byte === 1 ? 'intensity-fine' : 'intensity';
    case 'Colour':       return 'color-wheel';
    case 'Pan':          return byte === 1 ? 'pan-fine'  : 'pan';
    case 'Tilt':         return byte === 1 ? 'tilt-fine' : 'tilt';
    case 'Beam':
      if (/zoom/.test(n))  return 'zoom';
      if (/focus/.test(n)) return 'focus';
      if (/iris/.test(n))  return 'iris';
      if (/frost/.test(n)) return 'frost';
      if (/prism/.test(n)) return /rotat/.test(n) ? 'prism-rotation' : 'prism';
      return 'zoom';
    case 'Gobo':
      if (/rotat/.test(n)) return 'gobo-rotation-1';
      return 'gobo-wheel-1';
    case 'Shutter':      return 'shutter';
    case 'Speed':        return 'speed';
    case 'Maintenance':  return 'reset';
    case 'Effect':       return 'effect';
    case 'Nothing':
    default:             return 'nothing';
  }
}

function buildCapability(group: string, name: string, min: number, max: number, label: string, openTag: string): Capability {
  const opts = { min, max, label };
  if (group === 'Colour') {
    const color = attr(openTag, 'Color') ?? null;
    return new ColorCapability({ ...opts, color });
  }
  if (group === 'Gobo') {
    const res = attr(openTag, 'Res') ?? attr(openTag, 'Res1') ?? null;
    return new GoboCapability({ ...opts, image: res });
  }
  if (group === 'Shutter' || /strob/i.test(label)) {
    return new ShutterCapability({ ...opts, mode: /strob/i.test(label) ? 'strobe' : 'open' });
  }
  return new Capability(opts);
}

// ---- minimal XML helpers (regex-based — no DOMParser dep) ---------------
function textTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1].trim()) : null;
}

function innerTag(xml: string, tag: string): { openTag: string; text: string } | null {
  const re = new RegExp(`(<${tag}[^>]*>)([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  if (!m) return null;
  return { openTag: m[1], text: decode(m[2].trim()) };
}

function attr(openTag: string, name: string): string | null {
  const m = openTag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
}

/**
 * Find all <tag>...</tag> blocks. Returns [{openTag, body}, ...].
 * Greedy non-nested scan — fine for QLC+ where Channel and Mode don't nest.
 */
function findBlocks(xml: string, tag: string): XmlBlock[] {
  const out: XmlBlock[] = [];
  const re = new RegExp(`(<${tag}(?:\\s[^>]*)?>)([\\s\\S]*?)</${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push({ openTag: m[1], body: m[2] });
  }
  return out;
}

function decode(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/&amp;/g, '&');
}
