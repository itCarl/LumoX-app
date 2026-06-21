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

/** Lightweight vendor entry for the library UI (no definitions parsed). */
export interface VendorInfo {
  name: string;
  count: number;
  source: string;
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
  /** Root of the bundled `fixtures/<Vendor>/…` tree, for lazy per-vendor loading. */
  private builtinRoot: string | null = null;
  /** Vendors whose directory has been fully parsed into `definitions`. */
  private loadedVendors = new Set<string>();
  /** In-flight per-vendor loads, so concurrent `ensureVendor` calls share one read. */
  private vendorLoads = new Map<string, Promise<void>>();
  private allLoaded = false;

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
   * (lumox `.json` / `.lfx`). Recurses into subfolders —
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

  // ---- lazy per-vendor loading -------------------------------------------
  // The bundled library (hundreds of files) is NOT parsed at boot. Instead the
  // root is registered, vendors are listed cheaply from the directory tree, and
  // a vendor's definitions are parsed on demand — when its accordion is opened,
  // when a definition it owns is patched/loaded, or when a search forces a full
  // load. A definition id is `"<Vendor>/<Model>"`, and the vendor is the folder
  // name, so any id maps straight to its directory.

  /** Register the bundled `fixtures/` root for lazy loading (replaces an eager
   *  `loadFromDirectory` at boot). */
  setBuiltinRoot(dir: string): void { this.builtinRoot = dir; }

  /** Vendor of a definition id (`"<Vendor>/<Model>"`). */
  static vendorOf(id: string): string { return String(id).split('/')[0]; }

  /** Lightweight vendor list for the UI — bundled vendors from the directory
   *  tree (file counts, nothing parsed) plus any already-loaded user vendors. */
  async vendors(): Promise<VendorInfo[]> {
    const out: VendorInfo[] = [];
    if (this.builtinRoot) {
      let entries: import('node:fs').Dirent[] = [];
      try { entries = await readdir(this.builtinRoot, { withFileTypes: true }); } catch { /* no dir */ }
      for (const e of entries) {
        if (!e.isDirectory() || e.name.startsWith('.')) continue;
        let count = 0;
        try {
          const files = await readdir(path.join(this.builtinRoot, e.name));
          count = files.filter((f) => !!ImporterRegistry.forExtension(path.extname(f).toLowerCase())).length;
        } catch { /* ignore */ }
        if (count) out.push({ name: e.name, count, source: 'builtin' });
      }
    }
    // User (Custom) definitions are loaded eagerly and live flat — group by their
    // manufacturer so they appear as a vendor too.
    const userByVendor = new Map<string, number>();
    for (const d of this.definitions.values()) {
      if (d.source !== 'builtin' && d.manufacturer) userByVendor.set(d.manufacturer, (userByVendor.get(d.manufacturer) ?? 0) + 1);
    }
    for (const [name, count] of userByVendor) out.push({ name, count, source: 'user' });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Parse a bundled vendor's directory into the library (idempotent, deduped). */
  async ensureVendor(name: string): Promise<void> {
    if (this.loadedVendors.has(name) || !this.builtinRoot) return;
    let p = this.vendorLoads.get(name);
    if (!p) {
      p = this._loadVendorDir(name).finally(() => this.vendorLoads.delete(name));
      this.vendorLoads.set(name, p);
    }
    await p;
  }

  private async _loadVendorDir(name: string): Promise<void> {
    const result: LoadResult = { loaded: 0, skipped: 0, errors: [] };
    try { await this._scan(path.join(this.builtinRoot!, name), 'builtin', result); } catch { /* missing/empty vendor */ }
    this.loadedVendors.add(name);
  }

  /** Ensure a definition is loaded (parsing its vendor on demand); returns it. */
  async ensure(id: string): Promise<FixtureDefinition | undefined> {
    if (!this.definitions.has(id)) await this.ensureVendor(FixtureLibrary.vendorOf(id));
    return this.definitions.get(id);
  }

  /** Ensure every vendor referenced by a set of ids is loaded (project load). */
  async ensureForIds(ids: Iterable<string>): Promise<void> {
    const vendors = new Set<string>();
    for (const id of ids) { if (id) vendors.add(FixtureLibrary.vendorOf(id)); }
    await Promise.all([...vendors].map((v) => this.ensureVendor(v)));
  }

  /** Parse every bundled vendor (search / "browse all"). Idempotent. */
  async ensureAll(): Promise<void> {
    if (this.allLoaded) return;
    const vs = await this.vendors();
    await Promise.all(vs.filter((v) => v.source === 'builtin').map((v) => this.ensureVendor(v.name)));
    this.allLoaded = true;
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
