import { ChannelType, ChannelTypeRegistry as R } from '../ChannelType';

// Pan / tilt (with 16-bit fine) + absolute X/Y position presets.
R.register(new ChannelType({ id: 'pan',       name: 'Pan',       group: 'position', isPosition: true }));
R.register(new ChannelType({ id: 'pan-fine',  name: 'Pan Fine',  group: 'position', isPosition: true, fineOf: 'pan'  }));
R.register(new ChannelType({ id: 'tilt',      name: 'Tilt',      group: 'position', isPosition: true }));
R.register(new ChannelType({ id: 'tilt-fine', name: 'Tilt Fine', group: 'position', isPosition: true, fineOf: 'tilt' }));
R.register(new ChannelType({ id: 'x-axis',    name: 'X Axis',    group: 'position', isPosition: true }));
R.register(new ChannelType({ id: 'y-axis',    name: 'Y Axis',    group: 'position', isPosition: true }));

// Movement speed. The ramp direction is encoded in the channel (slow→fast vs
// fast→slow), so keep both plus a direction-agnostic one.
R.register(new ChannelType({ id: 'pan-tilt-speed',           name: 'Pan/Tilt Speed',             group: 'position' }));
R.register(new ChannelType({ id: 'pan-speed-slow-fast',      name: 'Pan Speed (slow→fast)',      group: 'position' }));
R.register(new ChannelType({ id: 'pan-speed-fast-slow',      name: 'Pan Speed (fast→slow)',      group: 'position' }));
R.register(new ChannelType({ id: 'tilt-speed-slow-fast',     name: 'Tilt Speed (slow→fast)',     group: 'position' }));
R.register(new ChannelType({ id: 'tilt-speed-fast-slow',     name: 'Tilt Speed (fast→slow)',     group: 'position' }));
R.register(new ChannelType({ id: 'pan-tilt-speed-slow-fast', name: 'Pan/Tilt Speed (slow→fast)', group: 'position' }));
R.register(new ChannelType({ id: 'pan-tilt-speed-fast-slow', name: 'Pan/Tilt Speed (fast→slow)', group: 'position' }));
