/**
 * Art-Net packet codec (subset).
 * Spec: https://art-net.org.uk/
 *
 * Implemented:
 *   ArtDmx       (OpCode 0x5000) — build
 *   ArtPoll      (OpCode 0x2000) — build (broadcast discovery)
 *   ArtPollReply (OpCode 0x2100) — parse (device discovery)
 */

export const ARTNET_PORT = 6454;
export const ARTNET_ID = Buffer.from('Art-Net\0', 'ascii'); // 8 bytes
export const PROTOCOL_VERSION = 14;

export const OP_POLL       = 0x2000;
export const OP_POLL_REPLY = 0x2100;
export const OP_DMX        = 0x5000;

/**
 * Build ArtDmx packet for one universe.
 * @param {number} portAddress  15-bit Art-Net port-address (Net<<8 | SubUni)
 * @param {number} sequence     0-255 (0 = disabled)
 * @param {Uint8Array} data     up to 512 bytes
 */
export function buildArtDmx(portAddress, sequence, data) {
  const length = Math.min(data.length, 512);
  const buf = Buffer.alloc(18 + length);
  ARTNET_ID.copy(buf, 0);                          // 0:  ID
  buf.writeUInt16LE(OP_DMX, 8);                    // 8:  OpCode (LE)
  buf.writeUInt16BE(PROTOCOL_VERSION, 10);         // 10: ProtVer (BE)
  buf.writeUInt8(sequence & 0xff, 12);             // 12: Sequence
  buf.writeUInt8(0, 13);                           // 13: Physical
  buf.writeUInt8(portAddress & 0xff, 14);          // 14: SubUni
  buf.writeUInt8((portAddress >> 8) & 0x7f, 15);   // 15: Net
  buf.writeUInt16BE(length, 16);                   // 16: Length (BE)
  Buffer.from(data.buffer, data.byteOffset, length).copy(buf, 18);
  return buf;
}

/** Build ArtPoll broadcast packet. */
export function buildArtPoll() {
  const buf = Buffer.alloc(14);
  ARTNET_ID.copy(buf, 0);
  buf.writeUInt16LE(OP_POLL, 8);
  buf.writeUInt16BE(PROTOCOL_VERSION, 10);
  buf.writeUInt8(0x02, 12); // TalkToMe: send reply on change
  buf.writeUInt8(0,    13); // Priority
  return buf;
}

/**
 * Parse incoming UDP packet. Returns null if not Art-Net.
 * @returns {{op:number, raw:Buffer, reply?:object} | null}
 */
export function parsePacket(buf) {
  if (buf.length < 12) return null;
  if (buf.compare(ARTNET_ID, 0, 8, 0, 8) !== 0) return null;
  const op = buf.readUInt16LE(8);
  const out = { op, raw: buf };
  if (op === OP_POLL_REPLY) out.reply = parsePollReply(buf);
  return out;
}

/**
 * Parse ArtPollReply — minimal fields useful for discovery UI.
 * Spec: Reply length >= 207 bytes.
 */
export function parsePollReply(buf) {
  if (buf.length < 207) return null;
  return {
    ip:           `${buf[10]}.${buf[11]}.${buf[12]}.${buf[13]}`,
    port:         buf.readUInt16LE(14),
    versInfo:     buf.readUInt16BE(16),
    netSwitch:    buf[18],
    subSwitch:    buf[19],
    oem:          buf.readUInt16BE(20),
    shortName:    readCString(buf, 26, 18),
    longName:     readCString(buf, 44, 64),
    nodeReport:   readCString(buf, 108, 64),
    numPorts:     buf.readUInt16BE(172),
    portTypes:    [buf[174], buf[175], buf[176], buf[177]],
    swOut:        [buf[190], buf[191], buf[192], buf[193]],
    swIn:         [buf[186], buf[187], buf[188], buf[189]],
  };
}

function readCString(buf, offset, max) {
  let end = offset;
  while (end < offset + max && buf[end] !== 0) end++;
  return buf.toString('ascii', offset, end);
}

/** Encode (net, subnet, universe) → 15-bit port-address. */
export function portAddress(net, subnet, universe) {
  return ((net & 0x7f) << 8) | ((subnet & 0x0f) << 4) | (universe & 0x0f);
}
