import dgram from 'node:dgram';
import { Output } from './Output';
import type { OutputConfig } from './Output';
import { ARTNET_PORT, buildArtDmx, buildArtPoll, parsePacket, portAddress } from '../protocols/artnet';
import { createLogger } from '../util/logger';
import type { Universe } from '../core/Universe';

const log = createLogger('ArtNetOutput');

/** Per-universe Art-Net port-address mapping. */
export interface ArtNetUniverseMapEntry {
  net: number;
  subnet: number;
  universe: number;
}

export interface ArtNetOutputConfig extends OutputConfig {
  host?: string;
  port?: number;
  broadcast?: boolean;
  universeMap?: { [universeId: number]: ArtNetUniverseMapEntry };
  bindAddress?: string;
  bindPort?: number;
}

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

  host: string;
  port: number;
  broadcast: boolean;
  universeMap: { [universeId: number]: ArtNetUniverseMapEntry };
  bindAddress: string;
  bindPort: number;
  _socket: dgram.Socket | null;
  _sequence: number;

  constructor(config: ArtNetOutputConfig = {}) {
    // Art-Net 4 spec caps refresh at 44 transmissions/sec (sec 4.2.1).
    // Default the cap here; callers can still override via config.maxRateHz.
    super({ name: 'Art-Net', maxRateHz: 44, ...config });
    this.host = config.host ?? '255.255.255.255';
    this.port = config.port ?? ARTNET_PORT;
    this.broadcast = config.broadcast ?? (this.host === '255.255.255.255');
    this.universeMap = config.universeMap ?? {};
    this.bindAddress = config.bindAddress ?? '0.0.0.0';
    this.bindPort = config.bindPort ?? 0; // 0 = ephemeral; use 6454 to receive
    this._socket = null;
    this._sequence = 0;
  }

  async _openImpl(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('message', (msg, rinfo) => this._onMessage(msg, rinfo));
      // Until bind completes, a socket error means open failed → reject. Once
      // bound, swap to the long-lived handler so later errors are emitted, not
      // double-handled by a stale reject listener.
      const onBindError = (err: Error) => reject(err);
      sock.once('error', onBindError);
      sock.bind(this.bindPort, this.bindAddress, () => {
        sock.removeListener('error', onBindError);
        sock.on('error', (err) => this.emit('error', err));
        if (this.broadcast) sock.setBroadcast(true);
        this._socket = sock;
        log.info(`open → ${this.host}:${this.port} (bind ${this.bindAddress}:${sock.address().port})`);
        resolve();
      });
    });
  }

  async _closeImpl(): Promise<void> {
    if (!this._socket) return;
    const sock = this._socket;
    this._socket = null;                // clear first — guards against re-entrant close
    sock.removeAllListeners();          // drop message/error handlers before teardown
    await new Promise<void>((res) => sock.close(res));
  }

  _sendImpl(universe: Universe, data: Uint8Array): void {
    const m = this.universeMap[universe.id] ?? {
      net: 0, subnet: 0, universe: universe.id & 0x0f,
    };
    const portAddr = portAddress(m.net, m.subnet, m.universe);
    const pkt = buildArtDmx(portAddr, this._sequence, data);
    this._sequence = (this._sequence + 1) & 0xff;
    if (this._sequence === 0) this._sequence = 1; // 0 means "disabled"
    this._socket!.send(pkt, 0, pkt.length, this.port, this.host);
  }

  /** Send ArtPoll broadcast — caller must have bound to 6454 to receive replies. */
  poll(): void {
    if (!this._socket) return;
    const pkt = buildArtPoll();
    this._socket.setBroadcast(true);
    this._socket.send(pkt, 0, pkt.length, this.port, '255.255.255.255');
  }

  _onMessage(buf: Buffer, rinfo: dgram.RemoteInfo): void {
    const pkt = parsePacket(buf);
    if (!pkt) return;
    if (pkt.reply) this.emit('pollReply', { ...pkt.reply, from: rinfo });
  }
}
