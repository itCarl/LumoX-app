/**
 * sACN E1.31 packet codec.
 * Spec: ANSI E1.31-2018.
 *
 * Packet layout for DMP Data Packet (638 bytes total for full 512-ch universe):
 *   [0..37]    Root Layer            (38 bytes)
 *   [38..114]  E1.31 Framing Layer   (77 bytes)
 *   [115..637] DMP Layer             (523 bytes incl. start code + 512 channels)
 */

export const SACN_PORT = 5568;

// Root layer constants
const PREAMBLE_SIZE       = 0x0010;
const POSTAMBLE_SIZE      = 0x0000;
const ACN_PACKET_ID       = Buffer.from('ASC-E1.17\0\0\0', 'ascii'); // 12 bytes
const VECTOR_ROOT_E131_DATA = 0x00000004;

// Framing layer constants
const VECTOR_E131_DATA_PACKET = 0x00000002;

// DMP layer constants
const VECTOR_DMP_SET_PROPERTY = 0x02;
const ADDRESS_DATA_TYPE       = 0xa1;

/** Multicast group for a given universe (1-63999). */
export function multicastGroup(universe: number): string {
  return `239.255.${(universe >> 8) & 0xff}.${universe & 0xff}`;
}

/** Options for building an E1.31 Data Packet. */
export interface DataPacketOptions {
  /** 16-byte source CID (UUID bytes) */
  cid: Buffer;
  /** up to 63 chars */
  sourceName: string;
  /** 1-63999 */
  universe: number;
  /** 0-200, default 100 */
  priority?: number;
  /** 0-255 rolling */
  sequence?: number;
  /** up to 512 bytes DMX */
  data: Uint8Array;
  /** sync universe, default 0 */
  syncAddr?: number;
  /** framing options byte (preview, terminate, force_sync) */
  options?: number;
}

/** Parsed inbound sACN data packet. */
export interface ParsedDataPacket {
  cid: Buffer;
  sourceName: string;
  priority: number;
  syncAddr: number;
  sequence: number;
  options: number;
  universe: number;
  data: Uint8Array;
}

/**
 * Build E1.31 Data Packet.
 *
 * @param {object} opts
 * @param {Buffer} opts.cid          16-byte source CID (UUID bytes)
 * @param {string} opts.sourceName   up to 63 chars
 * @param {number} opts.universe     1-63999
 * @param {number} opts.priority     0-200, default 100
 * @param {number} opts.sequence     0-255 rolling
 * @param {Uint8Array} opts.data     up to 512 bytes DMX
 * @param {number} [opts.syncAddr]   sync universe, default 0
 * @param {number} [opts.options]    framing options byte (preview, terminate, force_sync)
 */
export function buildDataPacket({
  cid, sourceName, universe, priority = 100,
  sequence = 0, data, syncAddr = 0, options = 0,
}: DataPacketOptions): Buffer {
  if (!Buffer.isBuffer(cid) || cid.length !== 16) {
    throw new Error('cid must be 16-byte Buffer');
  }
  const dmxLen = Math.min(data.length, 512);
  const propertyValueCount = 1 + dmxLen; // start code + DMX
  const total = 38 + 77 + 10 + 1 + dmxLen; // root + frame + DMP header(10) + startcode(1) + data
  const buf = Buffer.alloc(total);

  // ---- Root layer (38 bytes) ----
  buf.writeUInt16BE(PREAMBLE_SIZE,  0);
  buf.writeUInt16BE(POSTAMBLE_SIZE, 2);
  ACN_PACKET_ID.copy(buf, 4);                         // [4..15]
  const rootPduLen = total - 16;                      // PDU length from byte 16 onwards
  buf.writeUInt16BE(0x7000 | (rootPduLen & 0x0fff), 16);
  buf.writeUInt32BE(VECTOR_ROOT_E131_DATA, 18);
  cid.copy(buf, 22);                                  // [22..37]

  // ---- E1.31 Framing layer (77 bytes) ----
  const frameStart = 38;
  const framePduLen = total - frameStart;
  buf.writeUInt16BE(0x7000 | (framePduLen & 0x0fff), frameStart);
  buf.writeUInt32BE(VECTOR_E131_DATA_PACKET,         frameStart + 2);
  buf.write(sourceName.slice(0, 63), frameStart + 6, 64, 'utf8'); // null-padded
  // E1.31 priority is 0-200 (sec 6.2.3); clamp rather than mask so out-of-range
  // values can't wrap to a different valid priority.
  const prio = Math.max(0, Math.min(200, priority | 0));
  buf.writeUInt8(prio,                               frameStart + 70);
  buf.writeUInt16BE(syncAddr & 0xffff,               frameStart + 71);
  buf.writeUInt8(sequence & 0xff,                    frameStart + 73);
  buf.writeUInt8(options & 0xff,                     frameStart + 74);
  buf.writeUInt16BE(universe & 0xffff,               frameStart + 75);

  // ---- DMP layer ----
  const dmpStart = 38 + 77;
  const dmpPduLen = total - dmpStart;
  buf.writeUInt16BE(0x7000 | (dmpPduLen & 0x0fff), dmpStart);
  buf.writeUInt8(VECTOR_DMP_SET_PROPERTY,            dmpStart + 2);
  buf.writeUInt8(ADDRESS_DATA_TYPE,                  dmpStart + 3);
  buf.writeUInt16BE(0x0000,                          dmpStart + 4);  // First property addr
  buf.writeUInt16BE(0x0001,                          dmpStart + 6);  // Address increment
  buf.writeUInt16BE(propertyValueCount & 0xffff,     dmpStart + 8);
  buf.writeUInt8(0x00,                               dmpStart + 10); // DMX start code
  Buffer.from(data.buffer, data.byteOffset, dmxLen).copy(buf, dmpStart + 11);

  return buf;
}

/** Generate a random RFC 4122 v4 CID (16 bytes). */
export function generateCID(): Buffer {
  const b = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  return b;
}

/**
 * Parse an incoming sACN data packet. Returns null on mismatch.
 * Minimal: only validates root/framing vectors, extracts useful fields + DMX slice.
 */
export function parseDataPacket(buf: Buffer): ParsedDataPacket | null {
  if (buf.length < 126) return null;
  if (buf.readUInt16BE(0) !== PREAMBLE_SIZE) return null;
  if (buf.compare(ACN_PACKET_ID, 0, 12, 4, 16) !== 0) return null;
  if (buf.readUInt32BE(18) !== VECTOR_ROOT_E131_DATA) return null;
  if (buf.readUInt32BE(40) !== VECTOR_E131_DATA_PACKET) return null;

  const cid       = buf.slice(22, 38);
  const sourceName = readCString(buf, 44, 64);
  const priority  = buf.readUInt8(108);
  const syncAddr  = buf.readUInt16BE(109);
  const sequence  = buf.readUInt8(111);
  const options   = buf.readUInt8(112);
  const universe  = buf.readUInt16BE(113);

  const dmpStart  = 115;
  const propCount = buf.readUInt16BE(dmpStart + 8);
  const dmxLen    = Math.max(0, propCount - 1);
  const data      = Uint8Array.from(buf.slice(dmpStart + 11, dmpStart + 11 + dmxLen));

  return { cid, sourceName, priority, syncAddr, sequence, options, universe, data };
}

function readCString(buf: Buffer, offset: number, max: number): string {
  let end = offset;
  while (end < offset + max && buf[end] !== 0) end++;
  return buf.toString('utf8', offset, end);
}
