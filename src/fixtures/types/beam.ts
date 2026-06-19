import { ChannelType, ChannelTypeRegistry as R } from '../ChannelType';

// Beam shaping — zoom / focus / iris (each with a 16-bit fine counterpart),
// frost, framing blades. (Prism is its own group — see prism.ts.)
R.register(new ChannelType({ id: 'zoom',       name: 'Zoom',       group: 'beam' }));
R.register(new ChannelType({ id: 'zoom-fine',  name: 'Zoom Fine',  group: 'beam', fineOf: 'zoom' }));
R.register(new ChannelType({ id: 'focus',      name: 'Focus',      group: 'beam' }));
R.register(new ChannelType({ id: 'focus-fine', name: 'Focus Fine', group: 'beam', fineOf: 'focus' }));
R.register(new ChannelType({ id: 'iris',       name: 'Iris',       group: 'beam' }));
R.register(new ChannelType({ id: 'iris-fine',  name: 'Iris Fine',  group: 'beam', fineOf: 'iris' }));
R.register(new ChannelType({ id: 'frost',      name: 'Frost',      group: 'beam' }));
R.register(new ChannelType({ id: 'blade-1',    name: 'Blade 1',    group: 'beam' }));
R.register(new ChannelType({ id: 'blade-2',    name: 'Blade 2',    group: 'beam' }));
