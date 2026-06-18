import { FixtureImporter, ImporterRegistry } from './Importer';
import { FixtureDefinition } from '../FixtureDefinition';
import type { FixtureDefinitionJSON } from '../FixtureDefinition';

/**
 * LumoxImporter — native JSON round-trip.
 * Format: single FixtureDefinition or { definitions: FixtureDefinition[] }
 */
export class LumoxImporter extends FixtureImporter {
  static FORMAT = 'lumox';
  static EXTENSIONS = ['.json', '.lfx'];

  parse(input: string | Buffer): FixtureDefinition[] {
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    const obj = JSON.parse(text);
    // Ignore JSON-Schema documents (e.g. the bundled fixture schema) — they
    // share the `.json` extension but are not fixture definitions.
    if (obj && obj.$schema && !obj.definitions && !obj.modes) return [];
    const arr: FixtureDefinitionJSON[] = Array.isArray(obj) ? obj
              : obj.definitions ? obj.definitions
              : [obj];
    return arr
      .filter((d) => d && d.manufacturer && d.model)
      .map((d) => FixtureDefinition.fromJSON(d));
  }

  serialize(defs: FixtureDefinition | FixtureDefinition[]): string {
    const arr = Array.isArray(defs) ? defs : [defs];
    return JSON.stringify({ version: 1, definitions: arr.map((d) => d.toJSON()) }, null, 2);
  }
}

ImporterRegistry.register(LumoxImporter);
