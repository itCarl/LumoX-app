import { ChannelType, ChannelTypeRegistry as R } from '../ChannelType';

R.register(new ChannelType({ id: 'intensity', name: 'Intensity', group: 'intensity', isIntensity: true }));
R.register(new ChannelType({ id: 'intensity-fine', name: 'Intensity Fine', group: 'intensity', isIntensity: true, fineOf: 'intensity' }));
R.register(new ChannelType({ id: 'shutter', name: 'Shutter', group: 'intensity' }));
R.register(new ChannelType({ id: 'strobe', name: 'Strobe', group: 'intensity' }));
R.register(new ChannelType({ id: 'dimmer-curve', name: 'Dimmer Curve', group: 'intensity' }));
