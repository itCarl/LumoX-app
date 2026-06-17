import { ChannelType, ChannelTypeRegistry as R } from '../ChannelType.js';

R.register(new ChannelType({ id: 'gobo-wheel-1',     name: 'Gobo Wheel 1',     group: 'gobo' }));
R.register(new ChannelType({ id: 'gobo-wheel-2',     name: 'Gobo Wheel 2',     group: 'gobo' }));
R.register(new ChannelType({ id: 'gobo-rotation-1',  name: 'Gobo Rotation 1',  group: 'gobo' }));
R.register(new ChannelType({ id: 'gobo-rotation-2',  name: 'Gobo Rotation 2',  group: 'gobo' }));
R.register(new ChannelType({ id: 'gobo-shake',       name: 'Gobo Shake',       group: 'gobo' }));
