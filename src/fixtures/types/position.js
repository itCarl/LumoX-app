import { ChannelType, ChannelTypeRegistry as R } from '../ChannelType.js';

R.register(new ChannelType({ id: 'pan',       name: 'Pan',       group: 'position', isPosition: true }));
R.register(new ChannelType({ id: 'tilt',      name: 'Tilt',      group: 'position', isPosition: true }));
R.register(new ChannelType({ id: 'pan-fine',  name: 'Pan Fine',  group: 'position', isPosition: true, fineOf: 'pan'  }));
R.register(new ChannelType({ id: 'tilt-fine', name: 'Tilt Fine', group: 'position', isPosition: true, fineOf: 'tilt' }));
R.register(new ChannelType({ id: 'pan-tilt-speed', name: 'Pan/Tilt Speed', group: 'position' }));
