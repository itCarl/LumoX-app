import { EventEmitter } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { FixtureDefinition } from './FixtureDefinition';
import type { FixtureDefinitionJSON } from './FixtureDefinition';
import { ImporterRegistry } from './importers/Importer';

/** Filter options for `FixtureLibrary.find`. */
export interface FixtureFindOptions {
  manufacturer?: string;
  type?: string;
  query?: string;
}

/** Per-file error captured during a directory scan. */
export interface LoadError {
  file: string;
  err: string;
}

/** Aggregate result of `loadFromDirectory`. */
export interface LoadResult {
  loaded: number;
  skipped: number;
  errors: LoadError[];
}

/**
 * FixtureLibrary — searchable store of FixtureDefinitions.
 * Built-in + user defs share one library; segregate by `source` tag if needed.
 *
 * Events:
 *   'added'   (definition)
 *   'removed' (id)
 */
export class FixtureLibrary extends EventEmitter {
  definitions: Map<string, FixtureDefinition>;

  constructor() {
    super();
    this.definitions = new Map();
  }

  add(definition: FixtureDefinition | FixtureDefinitionJSON, source = 'user'): FixtureDefinition {
    const def = definition instanceof FixtureDefinition ? definition : FixtureDefinition.fromJSON(definition);
    def.source = source;
    this.definitions.set(def.id, def);
    this.emit('added', def);
    return def;
  }

  remove(id: string): void {
    if (this.definitions.delete(id)) this.emit('removed', id);
  }

  get(id: string): FixtureDefinition | undefined { return this.definitions.get(id); }

  list(): FixtureDefinition[] { return [...this.definitions.values()]; }

  /** Filter by manufacturer / type / free text search. */
  find({ manufacturer, type, query }: FixtureFindOptions = {}): FixtureDefinition[] {
    let r = this.list();
    if (manufacturer) r = r.filter((d) => d.manufacturer === manufacturer);
    if (type)         r = r.filter((d) => d.type === type);
    if (query) {
      const q = query.toLowerCase();
      r = r.filter((d) =>
        d.id.toLowerCase().includes(q) ||
        (d.model ?? '').toLowerCase().includes(q) ||
        (d.manufacturer ?? '').toLowerCase().includes(q));
    }
    return r;
  }

  manufacturers(): string[] {
    return [...new Set(this.list().map((d) => d.manufacturer))].filter((m): m is string => m != null).sort();
  }

  /**
   * Load every file under `dir` whose extension has a registered importer
   * (lumox `.json` / `.lfx`, QLC+5 `.qxf`). Recurses into subfolders —
   * convention: `fixtures/<Vendor>/<model>.lumox.json`.
   *
   * Hidden entries (dotfiles) are skipped.
   *
   * Returns `{ loaded, skipped, errors: [{file, err}] }`.
   */
  async loadFromDirectory(dir: string, { source = 'builtin' }: { source?: string } = {}): Promise<LoadResult> {
    const result: LoadResult = { loaded: 0, skipped: 0, errors: [] };
    await this._scan(dir, source, result);
    return result;
  }

  async _scan(dir: string, source: string, result: LoadResult): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await this._scan(full, source, result);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      const importer = ImporterRegistry.forExtension(ext);
      if (!importer) { result.skipped++; continue; }
      try {
        const buf = await readFile(full);
        for (const def of importer.parse(buf)) {
          this.add(def, source);
          result.loaded++;
        }
      } catch (err) {
        result.errors.push({ file: full, err: (err as Error).message });
      }
    }
  }
}
