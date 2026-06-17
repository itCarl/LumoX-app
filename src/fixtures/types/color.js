import { ChannelType, ChannelTypeRegistry as R } from '../ChannelType.js';

const C = (id, name, color, extras = {}) => R.register(new ChannelType({
  id, name, group: 'color', isColor: true, color, ...extras,
}));

C('red',     'Red',     '#ff0000');
C('green',   'Green',   '#00ff00');
C('blue',    'Blue',    '#0000ff');
C('white',   'White',   '#ffffff');
C('amber',   'Amber',   '#ffbf00');
C('uv',      'UV',      '#6b00ff');
C('lime',    'Lime',    '#bfff00');
C('cyan',    'Cyan',    '#00ffff');
C('magenta', 'Magenta', '#ff00ff');
C('yellow',  'Yellow',  '#ffff00');

// Fine counterparts (16-bit mixing)
C('red-fine',     'Red Fine',     '#ff0000', { fineOf: 'red' });
C('green-fine',   'Green Fine',   '#00ff00', { fineOf: 'green' });
C('blue-fine',    'Blue Fine',    '#0000ff', { fineOf: 'blue' });
C('white-fine',   'White Fine',   '#ffffff', { fineOf: 'white' });

// Color temperature / wheel
R.register(new ChannelType({ id: 'cto',         name: 'CTO',          group: 'color' }));
R.register(new ChannelType({ id: 'ctb',         name: 'CTB',          group: 'color' }));
R.register(new ChannelType({ id: 'color-wheel', name: 'Color Wheel',  group: 'color' }));
R.register(new ChannelType({ id: 'color-macro', name: 'Color Macro',  group: 'color' }));
