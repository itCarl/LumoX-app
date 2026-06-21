import { describe, it, expect } from 'vitest';
import {
  buildDataPacket, parseDataPacket, multicastGroup, generateCID,
} from '../../src/protocols/sacn';

const cid = Buffer.alloc(16, 0xab);

describe('multicastGroup — universe → E1.31 multicast address', () => {
  it('splits the universe into the low two octets', () => {
    expect(multicastGroup(1)).toBe('239.255.0.1');
    expect(multicastGroup(0x0102)).toBe('239.255.1.2');
    expect(multicastGroup(63999)).toBe('239.255.249.255');
  });
});

describe('generateCID', () => {
  it('is a 16-byte RFC 4122 v4 UUID', () => {
    const id = generateCID();
    expect(id.length).toBe(16);
    expect(id[6] & 0xf0).toBe(0x40); // version 4 nibble
    expect(id[8] & 0xc0).toBe(0x80); // variant bits
  });
});

describe('buildDataPacket', () => {
  it('rejects a CID that is not a 16-byte Buffer', () => {
    expect(() => buildDataPacket({ cid: Buffer.alloc(8), sourceName: 'x', universe: 1, data: new Uint8Array(0) }))
      .toThrow(/16-byte/);
  });

  it('sizes the buffer as root + framing + DMP + start-code + data', () => {
    const pkt = buildDataPacket({ cid, sourceName: 'Lumox', universe: 1, data: new Uint8Array(512) });
    expect(pkt.length).toBe(38 + 77 + 10 + 1 + 512);
  });

  it('clamps an oversized payload to 512 channels', () => {
    const pkt = buildDataPacket({ cid, sourceName: 'Lumox', universe: 1, data: new Uint8Array(600) });
    const parsed = parseDataPacket(pkt)!;
    expect(parsed.data.length).toBe(512);
  });
});

describe('buildDataPacket → parseDataPacket round-trip', () => {
  it('preserves every field', () => {
    const data = Uint8Array.from({ length: 16 }, (_, i) => i * 4);
    const pkt = buildDataPacket({
      cid, sourceName: 'Lumox Show', universe: 7, priority: 120,
      sequence: 42, data, syncAddr: 9, options: 0x80,
    });
    const r = parseDataPacket(pkt)!;
    expect(r.cid.equals(cid)).toBe(true);
    expect(r.sourceName).toBe('Lumox Show');
    expect(r.universe).toBe(7);
    expect(r.priority).toBe(120);
    expect(r.sequence).toBe(42);
    expect(r.syncAddr).toBe(9);
    expect(r.options).toBe(0x80);
    expect([...r.data]).toEqual([...data]);
  });

  it('defaults priority to 100 and clamps out-of-range priority to 200', () => {
    expect(parseDataPacket(buildDataPacket({ cid, sourceName: 's', universe: 1, data: new Uint8Array(1) }))!.priority).toBe(100);
    const hot = buildDataPacket({ cid, sourceName: 's', universe: 1, priority: 250, data: new Uint8Array(1) });
    expect(parseDataPacket(hot)!.priority).toBe(200);
  });
});

describe('parseDataPacket', () => {
  it('returns null for a too-short or non-sACN buffer', () => {
    expect(parseDataPacket(Buffer.alloc(50))).toBeNull();
    expect(parseDataPacket(Buffer.alloc(200))).toBeNull(); // right size, wrong preamble/id
  });
});
