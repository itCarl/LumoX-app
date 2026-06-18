import { ChannelType, ChannelTypeRegistry as R } from '../ChannelType';

R.register(new ChannelType({ id: 'speed',     name: 'Speed',     group: 'control' }));
R.register(new ChannelType({ id: 'sound',     name: 'Sound',     group: 'control' }));
R.register(new ChannelType({ id: 'macro',     name: 'Macro',     group: 'control' }));
R.register(new ChannelType({ id: 'function',  name: 'Function',  group: 'control' }));
R.register(new ChannelType({ id: 'reset',     name: 'Reset',     group: 'maintenance' }));
R.register(new ChannelType({ id: 'lamp',      name: 'Lamp',      group: 'maintenance' }));
R.register(new ChannelType({ id: 'fan',       name: 'Fan',       group: 'maintenance' }));
R.register(new ChannelType({ id: 'effect',    name: 'Effect',    group: 'effect' }));
R.register(new ChannelType({ id: 'effect-speed', name: 'Effect Speed', group: 'effect' }));
R.register(new ChannelType({ id: 'nothing',   name: 'Nothing',   group: 'control' }));
