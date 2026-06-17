import dgram from 'node:dgram';
import { Output } from './Output.js';
import { ARTNET_PORT, buildArtDmx, buildArtPoll, parsePacket, portAddress } from '../protocols/artnet.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('ArtNetOutput');

/**
 * ArtNetOutput — sends ArtDmx over UDP.
 *
 * Modes:
 *   unicast   — to a fixed `host` (preferred for known nodes)
 *   broadcast — to `255.255.255.255`
 *
 * Universe → port-address mapping:
 *   Engine uses logical universe ids; this output maps each one via
 *   `universeMap: { [universeId]: { net, subnet, universe } }`.
 *   Default (when unmapped): net=0, subnet=0, universe=universeId & 0x0f.
 *
 * Discovery: emits `pollReply` events for incoming ArtPollReply packets.
 */
export class ArtNetOutput extends Output {
  static TYPE = 'artnet';

  constructor(config = {}) {
    super({ name: 'Art-Net', ...config });
    this.host = config.host ?? '255.255.255.255';
    this.port = config.port ?? ARTNET_PORT;
    this.broadcast = config.broadcast ?? (this.host === '255.255.255.255');
    this.universeMap = config.universeMap ?? {};
    this.bindAddress = config.bindAddress ?? '0.0.0.0';
    this.bindPort = config.bindPort ?? 0; // 0 = ephemeral; use 6454 to receive
    this._socket = null;
    this._sequence = 0;
  }

  async _openImpl() {
    await new Promise((resolve, reject) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('error', (err) => this.emit('error', err));
      sock.on('message', (msg, rinfo) => this._onMessage(msg, rinfo));
      sock.bind(this.bindPort, this.bindAddress, () => {
        if (this.broadcast) sock.setBroadcast(true);
        this._socket = sock;
        log.info(`open → ${this.host}:${this.port} (bind ${this.bindAddress}:${sock.address().port})`);
        resolve();
      });
      sock.once('error', reject);
    });
  }

  async _closeImpl() {
    if (!this._socket) return;
    await new Promise((res) => this._socket.close(res));
    this._socket = null;
  }

  _sendImpl(universe, data) {
    const m = this.universeMap[universe.id] ?? {
      net: 0, subnet: 0, universe: universe.id & 0x0f,
    };
    const portAddr = portAddress(m.net, m.subnet, m.universe);
    const pkt = buildArtDmx(portAddr, this._sequence, data);
    this._sequence = (this._sequence + 1) & 0xff;
    if (this._sequence === 0) this._sequence = 1; // 0 means "disabled"
    this._socket.send(pkt, 0, pkt.length, this.port, this.host);
  }

  /** Send ArtPoll broadcast — caller must have bound to 6454 to receive replies. */
  poll() {
    if (!this._socket) return;
    const pkt = buildArtPoll();
    this._socket.setBroadcast(true);
    this._socket.send(pkt, 0, pkt.length, this.port, '255.255.255.255');
  }

  _onMessage(buf, rinfo) {
    const pkt = parsePacket(buf);
    if (!pkt) return;
    if (pkt.reply) this.emit('pollReply', { ...pkt.reply, from: rinfo });
  }
}
