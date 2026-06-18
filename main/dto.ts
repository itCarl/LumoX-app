// DTOs — the plain-JSON shapes the engine objects are mapped to before crossing
// the IPC boundary into the renderer. These are the contract `window.lumox.*`
// consumes; the mappers live in `serializers.ts`. Keeping the shapes here (one
// place) makes the boundary explicit and lets both sides share the types.

export interface ModeDTO {
  id: string;
  name: string;
  channelCount: number;
}

export interface DefDTO {
  id: string;
  manufacturer: string;
  model: string;
  type: string;
  emitters: number;
  source: string;
  modes: ModeDTO[];
}

export interface ChannelDTO {
  index: number;
  name: string;
  typeId: string | null;
  group: string | null;
  color: string | null;
}

export interface FixtureDTO {
  id: string;
  name: string;
  color: string;
  definitionId: string;
  model: string;
  type: string;
  emitters: number;
  modeId: string;
  modeName: string;
  configKey: string;
  groupId: string | null;
  groupName: string | null;
  universeId: number;
  startAddress: number;
  endAddress: number;
  channelCount: number;
  channels: ChannelDTO[];
}

export interface GroupDTO {
  id: string;
  name: string;
  color: string;
  configKey: string | null;
  fixtureIds: string[];
}

export interface SceneDTO {
  id: string;
  name: string;
  color: string;
  opacity: number;
  active: boolean;
}

export interface BankDTO {
  id: string;
  name: string;
  scenes: SceneDTO[];
}

export interface OutputDTO {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  isOpen: boolean;
  host: string | null;
  port: number | null;
  maxRateHz: number | null;
  subscribedUniverses: number[];
}

/** On-disk project file (format version 1). */
export interface ProjectData {
  format: 'lumox-project';
  version: number;
  // Section item shapes are validated lazily on restore; kept loose here.
  library?: any[];
  patch?: any[];
  groups?: any[];
  scenes?: any[];
  banks?: any[];
  devices?: any[];
}
