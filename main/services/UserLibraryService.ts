// UserLibraryService — the local, project-independent store for fixtures the
// user authors in the fixture editor. Built-in profiles ship read-only in the
// app's `fixtures/` directory; user fixtures persist here under the Electron
// `userData` directory as `.lumox.json` files, so they survive restarts and are
// shared across every project (a project still embeds the ones it uses, so it
// stays portable). They default to the "Custom" vendor — the library tile groups
// fixtures by manufacturer, so all of these surface under one "Custom" accordion.

import { app } from 'electron';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { LumoxImporter } from '../../src/index';
import type { FixtureDefinition } from '../../src/index';
import { show } from '../context';

/** Default vendor/manufacturer for user-authored fixtures. */
export const CUSTOM_VENDOR = 'Custom';

/** Where user fixtures live on disk — `<userData>/fixtures/`. */
export const userFixturesDir = (): string => path.join(app.getPath('userData'), 'fixtures');

/** Filesystem-safe filename stem from a definition id (`Custom/My PAR` → `custom-my-par`). */
function slug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'fixture';
}

/**
 * Load every user-authored fixture from `<userData>/fixtures/` into the shared
 * library, tagged `source: 'user'`. Creates the directory on first run. Called
 * at boot right after the built-in library loads, so user fixtures sit alongside
 * the built-ins (deduped by id — a project's embedded copy overwrites cleanly).
 */
export async function loadUserLibrary(): Promise<void> {
  const dir = userFixturesDir();
  try {
    await mkdir(dir, { recursive: true });
    const r = await show.library.loadFromDirectory(dir, { source: 'user' });
    console.log(`[show] user library: ${r.loaded} loaded, ${r.errors.length} errors (${dir})`);
  } catch (err) {
    console.error('[show] user library load failed:', (err as Error).message);
  }
}

/**
 * Persist one user fixture to `<userData>/fixtures/<slug>.lumox.json` so it
 * survives restarts. Re-saving a fixture with the same id overwrites its file
 * (edit = update). Returns the written path.
 */
export async function saveUserDefinition(def: FixtureDefinition): Promise<string> {
  const dir = userFixturesDir();
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${slug(def.id)}.lumox.json`);
  await writeFile(file, new LumoxImporter().serialize(def), 'utf8');
  return file;
}

/**
 * Delete a user fixture's file from `<userData>/fixtures/`. Idempotent — a
 * missing file is not an error (`rm` with `force`). The library's in-memory
 * removal is the handler's job; this only clears the persisted copy.
 */
export async function deleteUserDefinitionFile(id: string): Promise<void> {
  await rm(path.join(userFixturesDir(), `${slug(id)}.lumox.json`), { force: true });
}
