// Handler registry — wires every `lumox:*` IPC channel. Call once at startup.

import { registerWindowHandlers } from './window';
import { registerOutputHandlers } from './outputs';
import { registerUniverseHandlers } from './universes';
import { registerEngineHandlers } from './engine';
import { registerLibraryHandlers } from './library';
import { registerPatchHandlers } from './patch';
import { registerGroupHandlers } from './groups';
import { registerFixtureHandlers } from './fixtures';
import { registerSceneHandlers } from './scenes';
import { registerBankHandlers } from './banks';
import { registerProjectHandlers } from './project';

export function registerHandlers(): void {
  registerWindowHandlers();
  registerOutputHandlers();
  registerUniverseHandlers();
  registerEngineHandlers();
  registerLibraryHandlers();
  registerPatchHandlers();
  registerGroupHandlers();
  registerFixtureHandlers();
  registerSceneHandlers();
  registerBankHandlers();
  registerProjectHandlers();
}
