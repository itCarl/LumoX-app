import { ChannelType, ChannelTypeRegistry as R } from '../ChannelType.js';

R.register(new ChannelType({ id: 'zoom',            name: 'Zoom',            group: 'beam' }));
R.register(new ChannelType({ id: 'focus',           name: 'Focus',           group: 'beam' }));
R.register(new ChannelType({ id: 'iris',            name: 'Iris',            group: 'beam' }));
R.register(new ChannelType({ id: 'frost',           name: 'Frost',           group: 'beam' }));
R.register(new ChannelType({ id: 'prism',           name: 'Prism',           group: 'beam' }));
R.register(new ChannelType({ id: 'prism-rotation',  name: 'Prism Rotation',  group: 'beam' }));
R.register(new ChannelType({ id: 'blade-1',         name: 'Blade 1',         group: 'beam' }));
R.register(new ChannelType({ id: 'blade-2',         name: 'Blade 2',         group: 'beam' }));
