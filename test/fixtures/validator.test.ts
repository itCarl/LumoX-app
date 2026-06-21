import { describe, it, expect } from 'vitest';
import { FixtureValidator, FixtureDefinition } from '../../src/index';

const v = () => new FixtureValidator();

/** A minimal, well-formed file object: { version, definitions:[...] }. */
function validFile() {
  return {
    version: 1,
    definitions: [
      new FixtureDefinition({
        manufacturer: 'Acme', model: 'Spot',
        modes: [{ name: 'Basic', channels: [{ typeId: 'intensity', defaultValue: 0 }] }],
      }).toJSON(),
    ],
  };
}

describe('FixtureValidator.validate — file shape', () => {
  it('accepts a well-formed file', () => {
    const r = v().validate(validFile());
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('flags a wrong version, non-object root, and missing definitions', () => {
    expect(v().validate({ ...validFile(), version: 2 }).valid).toBe(false);
    expect(v().validate(null).valid).toBe(false);
    expect(v().validate({ version: 1 }).valid).toBe(false); // definitions not an array
    expect(v().validate({ version: 1, definitions: [] }).valid).toBe(false); // empty
  });
});

describe('FixtureValidator — definition / mode / channel rules', () => {
  it('requires manufacturer + model and at least one mode', () => {
    const r = v().validateDefinition({ model: 'X', modes: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /manufacturer/.test(e.path))).toBe(true);
    expect(r.errors.some((e) => /modes/.test(e.path))).toBe(true);
  });

  it('rejects an unknown channel typeId', () => {
    const r = v().validateDefinition({
      manufacturer: 'A', model: 'B',
      modes: [{ name: 'm', channels: [{ typeId: 'bogus-type' }] }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /unknown ChannelType/.test(e.message))).toBe(true);
  });

  it('rejects an out-of-range defaultValue', () => {
    const r = v().validateDefinition({
      manufacturer: 'A', model: 'B',
      modes: [{ name: 'm', channels: [{ typeId: 'intensity', defaultValue: 300 }] }],
    });
    expect(r.errors.some((e) => /defaultValue/.test(e.path))).toBe(true);
  });

  it('errors when a mode exceeds the 512-channel universe', () => {
    const channels = Array.from({ length: 513 }, () => ({ typeId: 'intensity' }));
    const r = v().validateDefinition({ manufacturer: 'A', model: 'B', modes: [{ name: 'm', channels }] });
    expect(r.errors.some((e) => /512/.test(e.message))).toBe(true);
  });

  it('warns on a fine channel with no coarse counterpart', () => {
    const r = v().validateDefinition({
      manufacturer: 'A', model: 'B',
      modes: [{ name: 'm', channels: [{ typeId: 'pan-fine' }] }],
    });
    expect(r.valid).toBe(true); // warning, not error
    expect(r.warnings.some((w) => /coarse counterpart/.test(w.message))).toBe(true);
  });

  it('warns on a non-semver meta version', () => {
    const r = v().validateDefinition({
      manufacturer: 'A', model: 'B', meta: { version: 'v1' },
      modes: [{ name: 'm', channels: [{ typeId: 'intensity' }] }],
    });
    expect(r.warnings.some((w) => /semver/.test(w.message))).toBe(true);
  });
});
