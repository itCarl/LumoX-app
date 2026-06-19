import type { FixtureDefinition } from '../FixtureDefinition';

/**
 * Importer — plugin for parsing fixture profile files.
 *
 * Built-in format (registered automatically):
 *   - 'lumox'  → Lumox JSON     (.json / .lfx)   round-trip
 *
 * The registry is open: third-party formats can be added at runtime, but
 * the project ships with only this one.
 *
 * Subclasses MUST implement:
 *   static FORMAT       unique id (e.g. 'lumox')
 *   static EXTENSIONS   [String]   (e.g. ['.json'])
 *   parse(input)        → FixtureDefinition[]   (input: string | Buffer)
 *
 * Optional:
 *   serialize(defs)     → string | Buffer        (round-trip export)
 *
 * Register via `ImporterRegistry.register(MyImporter)`.
 */
export class FixtureImporter {
  static FORMAT = 'abstract';
  static EXTENSIONS: string[] = [];

  parse(_input: string | Buffer): FixtureDefinition[] { throw new Error('Importer.parse not implemented'); }
  serialize(_defs: FixtureDefinition | FixtureDefinition[]): string | Buffer { throw new Error('Importer.serialize not implemented'); }
}

/** Constructor type for any `FixtureImporter` subclass with static metadata. */
export interface FixtureImporterClass {
  FORMAT: string;
  EXTENSIONS: string[];
  new (): FixtureImporter;
}

export class ImporterRegistry {
  static _importers: Map<string, FixtureImporterClass> = new Map();

  static register(klass: FixtureImporterClass): void {
    if (!klass.FORMAT || klass.FORMAT === 'abstract') {
      throw new Error('Importer must define static FORMAT');
    }
    ImporterRegistry._importers.set(klass.FORMAT, klass);
  }

  static get(format: string): FixtureImporter | null {
    const K = ImporterRegistry._importers.get(format);
    return K ? new K() : null;
  }

  static forExtension(ext: string): FixtureImporter | null {
    const e = ext.toLowerCase();
    for (const K of ImporterRegistry._importers.values()) {
      if (K.EXTENSIONS.includes(e)) return new K();
    }
    return null;
  }

  static formats(): string[] { return [...ImporterRegistry._importers.keys()]; }
}
