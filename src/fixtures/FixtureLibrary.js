import { EventEmitter } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { FixtureDefinition } from './FixtureDefinition.js';
import { ImporterRegistry } from './importers/Importer.js';

/**
 * FixtureLibrary — searchable store of FixtureDefinitions.
 * Built-in + user defs share one library; segregate by `source` tag if needed.
 *
 * Events:
 *   'added'   (definition)
 *   'removed' (id)
 */
export class FixtureLibrary extends EventEmitter {
  constructor() {
    super();
    this.definitions = new Map();
  }

  add(definition, source = 'user') {
    const def = definition instanceof FixtureDefinition ? definition : FixtureDefinition.fromJSON(definition);
    def.source = source;
    this.definitions.set(def.id, def);
    this.emit('added', def);
    return def;
  }

  remove(id) {
    if (this.definitions.delete(id)) this.emit('removed', id);
  }

  get(id) { return this.definitions.get(id); }

  list() { return [...this.definitions.values()]; }

  /** Filter by manufacturer / type / free text search. */
  find({ manufacturer, type, query } = {}) {
    let r = this.list();
    if (manufacturer) r = r.filter((d) => d.manufacturer === manufacturer);
    if (type)         r = r.filter((d) => d.type === type);
    if (query) {
      const q = query.toLowerCase();
      r = r.filter((d) =>
        d.id.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q) ||
        d.manufacturer.toLowerCase().includes(q));
    }
    return r;
  }

  manufacturers() {
    return [...new Set(this.list().map((d) => d.manufacturer))].sort();
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
  async loadFromDirectory(dir, { source = 'builtin' } = {}) {
    const result = { loaded: 0, skipped: 0, errors: [] };
    await this._scan(dir, source, result);
    return result;
  }

  async _scan(dir, source, result) {
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
        result.errors.push({ file: full, err: err.message });
      }
    }
  }
}
