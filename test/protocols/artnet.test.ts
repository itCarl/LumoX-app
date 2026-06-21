import { describe, it, expect } from 'vitest';
import {
  buildArtDmx, buildArtPoll, parsePacket, parsePollReply, portAddress,
  ARTNET_ID, OP_DMX, OP_POLL, OP_POLL_REPLY, PROTOCOL_VERSION,
} from '../../src/protocols/artnet';

describe('portAddress — 15-bit Net/SubNet/Universe encoding', () => {
  it('packs the three nibbles/fields and masks each', () => {
    expect(portAddress(0, 0, 0)).toBe(0);
    expect(portAddress(0, 0, 5)).toBe(5);
    expect(portAddress(1, 2, 3)).toBe((1 << 8) | (2 << 4) | 3);
    // over-range fields are masked, not allowed to bleed into neighbours
    expect(portAddress(0xff, 0xff, 0xff)).toBe((0x7f << 8) | (0xf << 4) | 0xf);
  });
});

describe('buildArtDmx', () => {
  it('writes the documented header layout', () => {
    const data = Uint8Array.from([10, 20, 30]);
    const pkt = buildArtDmx(portAddress(1, 2, 3), 7, data);
    expect(pkt.compare(ARTNET_ID, 0, 8, 0, 8)).toBe(0);
    expect(pkt.readUInt16LE(8)).toBe(OP_DMX);           // OpCode little-endian
    expect(pkt.readUInt16BE(10)).toBe(PROTOCOL_VERSION); // ProtVer big-endian
    expect(pkt.readUInt8(12)).toBe(7);                   // Sequence
    expect(pkt.readUInt8(13)).toBe(0);                   // Physical
    expect(pkt.readUInt8(14)).toBe(portAddress(1, 2, 3) & 0xff);        // SubUni
    expect(pkt.readUInt8(15)).toBe((portAddress(1, 2, 3) >> 8) & 0x7f); // Net
    expect(pkt.readUInt16BE(16)).toBe(3);                // Length
    expect([...pkt.subarray(18)]).toEqual([10, 20, 30]);
  });

  it('masks the sequence to a byte', () => {
    expect(buildArtDmx(0, 300, Uint8Array.of(0)).readUInt8(12)).toBe(300 & 0xff);
  });

  it('clamps the DMX payload to 512 channels', () => {
    const pkt = buildArtDmx(0, 0, new Uint8Array(600));
    expect(pkt.readUInt16BE(16)).toBe(512);
    expect(pkt.length).toBe(18 + 512);
  });
});

describe('buildArtPoll', () => {
  it('is a 14-byte ArtPoll with TalkToMe = on-change', () => {
    const pkt = buildArtPoll();
    expect(pkt.length).toBe(14);
    expect(pkt.readUInt16LE(8)).toBe(OP_POLL);
    expect(pkt.readUInt8(12)).toBe(0x02);
  });
});

describe('parsePacket', () => {
  it('rejects non-Art-Net payloads', () => {
    expect(parsePacket(Buffer.from('hello world!!'))).toBeNull();
    expect(parsePacket(Buffer.alloc(4))).toBeNull(); // too short
  });

  it('reads the OpCode of a known packet', () => {
    expect(parsePacket(buildArtPoll())!.op).toBe(OP_POLL);
    expect(parsePacket(buildArtDmx(0, 1, Uint8Array.of(1)))!.op).toBe(OP_DMX);
  });

  it('parses an ArtPollReply into a device record', () => {
    const reply = buildPollReply();
    const parsed = parsePacket(reply)!;
    expect(parsed.op).toBe(OP_POLL_REPLY);
    expect(parsed.reply).toMatchObject({ ip: '192.168.1.50', shortName: 'NodeS', longName: 'Node Long' });
  });
});

describe('parsePollReply', () => {
  it('returns null below the 207-byte minimum', () => {
    expect(parsePollReply(Buffer.alloc(100))).toBeNull();
  });

  it('extracts ip, names, ports and mac', () => {
    const r = parsePollReply(buildPollReply())!;
    expect(r.ip).toBe('192.168.1.50');
    expect(r.shortName).toBe('NodeS');
    expect(r.longName).toBe('Node Long');
    expect(r.numPorts).toBe(1);
    expect(r.mac).toBe('de:ad:be:ef:00:01');
  });
});

/** Assemble a minimal but well-formed ArtPollReply (>= 207 bytes). */
function buildPollReply(): Buffer {
  const buf = Buffer.alloc(207);
  ARTNET_ID.copy(buf, 0);
  buf.writeUInt16LE(OP_POLL_REPLY, 8);
  buf[10] = 192; buf[11] = 168; buf[12] = 1; buf[13] = 50;  // IP
  buf.writeUInt16BE(1, 172);                                 // numPorts
  buf.write('NodeS', 26, 'ascii');
  buf.write('Node Long', 44, 'ascii');
  Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01]).copy(buf, 201); // MAC
  return buf;
}
