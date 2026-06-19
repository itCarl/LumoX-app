import { ChannelType, ChannelTypeRegistry as R } from '../ChannelType';

// "Prism" group — prism insertion + rotation. The rotation ramp direction is
// encoded in the preset (Slow→Fast vs Fast→Slow); keep both plus a
// direction-agnostic rotation channel.
R.register(new ChannelType({ id: 'prism',                    name: 'Prism',                      group: 'prism' }));
R.register(new ChannelType({ id: 'prism-rotation',           name: 'Prism Rotation',             group: 'prism' }));
R.register(new ChannelType({ id: 'prism-rotation-slow-fast', name: 'Prism Rotation (slow→fast)', group: 'prism' }));
R.register(new ChannelType({ id: 'prism-rotation-fast-slow', name: 'Prism Rotation (fast→slow)', group: 'prism' }));
