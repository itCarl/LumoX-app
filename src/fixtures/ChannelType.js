/**
 * ChannelType — semantic class of a DMX channel (intensity, red, pan, ...).
 * Modular via `ChannelTypeRegistry`. Built-ins self-register from
 * `src/fixtures/types/*.js`. App code or plugins call `register()` to add more.
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
export class ChannelType {
  constructor({
    id, name, group,
    isIntensity = false,
    isColor = false,
    isPosition = false,
    fineOf = null,
    color = null,
    defaultValue = 0,
  }) {
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
  static _types = new Map();

  static register(type) {
    if (!(type instanceof ChannelType)) {
      throw new Error('register expects ChannelType instance');
    }
    ChannelTypeRegistry._types.set(type.id, type);
    return type;
  }

  static get(id) { return ChannelTypeRegistry._types.get(id); }
  static has(id) { return ChannelTypeRegistry._types.has(id); }
  static all()   { return [...ChannelTypeRegistry._types.values()]; }

  static byGroup(group) {
    return ChannelTypeRegistry.all().filter((t) => t.group === group);
  }

  static intensities() {
    return ChannelTypeRegistry.all().filter((t) => t.isIntensity);
  }
}
