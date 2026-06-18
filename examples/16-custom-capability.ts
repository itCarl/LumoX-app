// 16 — Register a new Capability kind. Survives JSON round-trip via
// `CapabilityRegistry.fromJSON`.
//
//   node examples/16-custom-capability.js

import {
  Capability, CapabilityRegistry,
  ChannelDefinition, FixtureMode, FixtureDefinition,
  LumoxImporter,
} from '../src/index';
import type { CapabilityOptions } from '../src/fixtures/Capability';

// New capability kind: animation wheel pattern
class AnimationCapability extends Capability {
  static KIND = 'animation';
  pattern: string;
  direction: string;
  constructor(opts: CapabilityOptions & { pattern?: string; direction?: string }) {
    super(opts);
    this.pattern = opts.pattern ?? 'unknown';    // 'fire', 'water', 'clouds', ...
    this.direction = opts.direction ?? 'forward'; // 'forward' | 'reverse'
  }
  toJSON() {
    return { ...super.toJSON(), pattern: this.pattern, direction: this.direction };
  }
}
CapabilityRegistry.register(AnimationCapability);

// Build a profile that uses it
const def = new FixtureDefinition({
  manufacturer: 'Demo', model: 'Animator', type: 'Effect',
  modes: [new FixtureMode({ name: '1ch', channels: [
    new ChannelDefinition({
      typeId: 'effect', name: 'Animation',
      capabilities: [
        new Capability({ min: 0, max: 9, label: 'Off' }),
        new AnimationCapability({ min: 10,  max: 80,  label: 'Fire',   pattern: 'fire' }),
        new AnimationCapability({ min: 81,  max: 160, label: 'Water',  pattern: 'water' }),
        new AnimationCapability({ min: 161, max: 255, label: 'Clouds', pattern: 'clouds', direction: 'reverse' }),
      ],
    }),
  ]})],
});

// Round-trip through Lumox JSON
const importer = new LumoxImporter();
const json = importer.serialize([def]);
const [reread] = importer.parse(json);

const cap = reread.modes[0].channels[0]!.capabilityAt(100) as any;
console.log('Capability at value 100:');
console.log('  kind     =', cap.kind);
console.log('  label    =', cap.label);
console.log('  pattern  =', cap.pattern);
console.log('  is AnimationCapability:', cap instanceof AnimationCapability);
