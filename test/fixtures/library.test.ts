import { describe, it, expect, vi } from 'vitest';
import { FixtureLibrary, FixtureDefinition, LumoxImporter } from '../../src/index';

function def(manufacturer: string, model: string, type = 'PAR') {
  return new FixtureDefinition({
    manufacturer, model, type,
    modes: [{ name: 'm', channels: [{ typeId: 'intensity' }] }],
  });
}

describe('FixtureLibrary — store + search', () => {
  it('add tags the source and indexes by id; remove deletes', () => {
    const lib = new FixtureLibrary();
    const d = lib.add(def('Acme', 'Spot'), 'builtin');
    expect(d.source).toBe('builtin');
    expect(lib.get('Acme/Spot')).toBe(d);
    lib.remove('Acme/Spot');
    expect(lib.get('Acme/Spot')).toBeUndefined();
  });

  it('emits added / removed events', () => {
    const lib = new FixtureLibrary();
    const added = vi.fn(); const removed = vi.fn();
    lib.on('added', added); lib.on('removed', removed);
    lib.add(def('Acme', 'Spot'));
    lib.remove('Acme/Spot');
    expect(added).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledTimes(1);
  });

  it('find filters by manufacturer, type and free-text query', () => {
    const lib = new FixtureLibrary();
    lib.add(def('Acme', 'Spot', 'Moving Head'));
    lib.add(def('Acme', 'Wash', 'PAR'));
    lib.add(def('Globe', 'Strobe', 'Strobe'));
    expect(lib.find({ manufacturer: 'Acme' }).map((d) => d.model).sort()).toEqual(['Spot', 'Wash']);
    expect(lib.find({ type: 'Strobe' }).map((d) => d.model)).toEqual(['Strobe']);
    expect(lib.find({ query: 'wash' }).map((d) => d.model)).toEqual(['Wash']);
  });

  it('manufacturers returns a sorted unique list', () => {
    const lib = new FixtureLibrary();
    lib.add(def('Zebra', 'A')); lib.add(def('Acme', 'B')); lib.add(def('Acme', 'C'));
    expect(lib.manufacturers()).toEqual(['Acme', 'Zebra']);
  });

  it('vendorOf splits the vendor prefix from an id', () => {
    expect(FixtureLibrary.vendorOf('Acme/Spot 200')).toBe('Acme');
  });
});

describe('LumoxImporter — native JSON round-trip', () => {
  const importer = new LumoxImporter();

  it('serialize then parse reconstructs the definitions', () => {
    const d = def('Acme', 'Spot');
    const json = importer.serialize(d);
    const [parsed] = importer.parse(json);
    expect(parsed.id).toBe('Acme/Spot');
    expect(parsed.defaultMode?.channels[0]?.typeId).toBe('intensity');
  });

  it('accepts a single object, an array, or a { definitions } wrapper', () => {
    const single = JSON.stringify(def('A', 'B').toJSON());
    expect(importer.parse(single)).toHaveLength(1);
    const arr = JSON.stringify([def('A', 'B').toJSON(), def('A', 'C').toJSON()]);
    expect(importer.parse(arr)).toHaveLength(2);
  });

  it('skips JSON-Schema documents and entries missing manufacturer/model', () => {
    expect(importer.parse(JSON.stringify({ $schema: 'http://x', type: 'object' }))).toEqual([]);
    expect(importer.parse(JSON.stringify([{ model: 'no-manufacturer' }]))).toEqual([]);
  });

  it('declares the lumox extensions', () => {
    expect(LumoxImporter.EXTENSIONS).toContain('.json');
    expect(LumoxImporter.EXTENSIONS).toContain('.lfx');
  });
});
