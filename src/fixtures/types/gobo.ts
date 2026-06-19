import { ChannelType, ChannelTypeRegistry as R } from '../ChannelType';

// "Gobo" group — wheel selection (GoboWheel), indexing/rotation position
// (GoboIndex), plus the rotation + shake channels Lumox already carried.
R.register(new ChannelType({ id: 'gobo-wheel-1',      name: 'Gobo Wheel 1',      group: 'gobo' }));
R.register(new ChannelType({ id: 'gobo-wheel-1-fine', name: 'Gobo Wheel 1 Fine', group: 'gobo', fineOf: 'gobo-wheel-1' }));
R.register(new ChannelType({ id: 'gobo-wheel-2',      name: 'Gobo Wheel 2',      group: 'gobo' }));
R.register(new ChannelType({ id: 'gobo-index',        name: 'Gobo Index',        group: 'gobo' }));
R.register(new ChannelType({ id: 'gobo-index-fine',   name: 'Gobo Index Fine',   group: 'gobo', fineOf: 'gobo-index' }));
R.register(new ChannelType({ id: 'gobo-rotation-1',   name: 'Gobo Rotation 1',   group: 'gobo' }));
R.register(new ChannelType({ id: 'gobo-rotation-2',   name: 'Gobo Rotation 2',   group: 'gobo' }));
R.register(new ChannelType({ id: 'gobo-shake',        name: 'Gobo Shake',        group: 'gobo' }));
