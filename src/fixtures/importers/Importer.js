/**
 * Importer — plugin for parsing fixture profile files.
 *
 * Built-in formats (registered automatically):
 *   - 'lumox'  → Lumox JSON          (.json / .lfx)   round-trip
 *   - 'qlc+5'  → QLC+ 5 XML profile  (.qxf)           parse only
 *
 * The registry is open: third-party formats can be added at runtime, but
 * the project ships with only these two.
 *
 * Subclasses MUST implement:
 *   static FORMAT       unique id ('lumox', 'qlc+5')
 *   static EXTENSIONS   [String]   (['.json'], ['.qxf'])
 *   parse(input)        → FixtureDefinition[]   (input: string | Buffer)
 *
 * Optional:
 *   serialize(defs)     → string | Buffer        (round-trip export)
 *
 * Register via `ImporterRegistry.register(MyImporter)`.
 */
export class FixtureImporter {
  static FORMAT = 'abstract';
  static EXTENSIONS = [];

  parse(_input) { throw new Error('Importer.parse not implemented'); }
  serialize(_defs) { throw new Error('Importer.serialize not implemented'); }
}

export class ImporterRegistry {
  static _importers = new Map();

  static register(klass) {
    if (!klass.FORMAT || klass.FORMAT === 'abstract') {
      throw new Error('Importer must define static FORMAT');
    }
    ImporterRegistry._importers.set(klass.FORMAT, klass);
  }

  static get(format) {
    const K = ImporterRegistry._importers.get(format);
    return K ? new K() : null;
  }

  static forExtension(ext) {
    const e = ext.toLowerCase();
    for (const K of ImporterRegistry._importers.values()) {
      if (K.EXTENSIONS.includes(e)) return new K();
    }
    return null;
  }

  static formats() { return [...ImporterRegistry._importers.keys()]; }
}
