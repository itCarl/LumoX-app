/**
 * ChannelType — semantic class of a DMX channel (intensity, red, pan, ...).
 * Modular via `ChannelTypeRegistry`. Built-ins self-register from
 * `src/fixtures/types/*.ts`. App code or plugins call `register()` to add more.
 *
 * Groups:
 *   intensity  brightness/dimmer/shutter
 *   color      red/green/blue/white/amber/cyan/magenta/yellow/uv/lime/cto/ctb
 *   position   pan/tilt + fine counterparts
 *   beam       zoom/focus/iris/frost/prism/blade
 *   gobo       wheel + rotation
 *   control    speed/sound/macro/reset/function
 *   effect     generator effects on fixture side (built-in patterns)
 *   maintenance lamp on/off, reset, fan, dim curve
 *
 * Conventions:
 *   id            kebab-case ASCII (`pan`, `pan-fine`, `color-wheel`)
 *   isIntensity   GrandMaster + Blackout `intensity-only` modes scan these
 *   fineOf        for 16-bit pairs — id of coarse counterpart (`fineOf: 'pan'`)
 *   color         hex string used by color channels (`#ff0000`) — UI hint, optional
 */

/** Options bag accepted by the `ChannelType` constructor. */
export interface ChannelTypeOptions {
  id: string;
  name?: string | null;
  group: string;
  isIntensity?: boolean;
  isColor?: boolean;
  isPosition?: boolean;
  fineOf?: string | null;
  color?: string | null;
  defaultValue?: number;
}

export class ChannelType {
  id: string;
  name: string;
  group: string;
  isIntensity: boolean;
  isColor: boolean;
  isPosition: boolean;
  fineOf: string | null;
  color: string | null;
  defaultValue: number;

  constructor({
    id, name, group,
    isIntensity = false,
    isColor = false,
    isPosition = false,
    fineOf = null,
    color = null,
    defaultValue = 0,
  }: ChannelTypeOptions) {
    if (!id || !group) throw new Error('ChannelType requires id + group');
    this.id = id;
    this.name = name ?? id;
    this.group = group;
    this.isIntensity = isIntensity;
    this.isColor = isColor;
    this.isPosition = isPosition;
    this.fineOf = fineOf;
    this.color = color;
    this.defaultValue = defaultValue & 0xff;
  }
}

export class ChannelTypeRegistry {
  static _types: Map<string, ChannelType> = new Map();

  static register(type: ChannelType): ChannelType {
    if (!(type instanceof ChannelType)) {
      throw new Error('register expects ChannelType instance');
    }
    ChannelTypeRegistry._types.set(type.id, type);
    return type;
  }

  static get(id: string): ChannelType | undefined { return ChannelTypeRegistry._types.get(id); }
  static has(id: string): boolean { return ChannelTypeRegistry._types.has(id); }
  static all(): ChannelType[]   { return [...ChannelTypeRegistry._types.values()]; }

  static byGroup(group: string): ChannelType[] {
    return ChannelTypeRegistry.all().filter((t) => t.group === group);
  }

  static intensities(): ChannelType[] {
    return ChannelTypeRegistry.all().filter((t) => t.isIntensity);
  }
}
