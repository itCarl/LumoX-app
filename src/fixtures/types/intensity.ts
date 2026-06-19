import { ChannelType, ChannelTypeRegistry as R } from '../ChannelType';

// Intensity presets — brightness/shutter. A whole-fixture Master Dimmer is kept
// distinct from a per-element Dimmer; both scale brightness so both are
// `isIntensity` (GrandMaster + Blackout intensity-only modes scan these).
R.register(new ChannelType({ id: 'intensity-master',      name: 'Master Dimmer',      group: 'intensity', isIntensity: true }));
R.register(new ChannelType({ id: 'intensity-master-fine', name: 'Master Dimmer Fine', group: 'intensity', isIntensity: true, fineOf: 'intensity-master' }));
R.register(new ChannelType({ id: 'intensity',      name: 'Intensity',      group: 'intensity', isIntensity: true }));
R.register(new ChannelType({ id: 'intensity-fine', name: 'Intensity Fine', group: 'intensity', isIntensity: true, fineOf: 'intensity' }));
R.register(new ChannelType({ id: 'shutter',        name: 'Shutter',        group: 'intensity' }));
R.register(new ChannelType({ id: 'strobe',         name: 'Strobe',         group: 'intensity' }));
R.register(new ChannelType({ id: 'dimmer-curve',   name: 'Dimmer Curve',   group: 'intensity' }));
