import dgram from 'node:dgram';
import { Output } from './Output.js';
import { SACN_PORT, buildDataPacket, generateCID, multicastGroup } from '../protocols/sacn.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('SacnOutput');

/**
 * SacnOutput — sends sACN E1.31 Data Packets.
 *
 * Modes:
 *   multicast (default) — to 239.255.x.x derived from universe number
 *   unicast             — to a fixed `host`
 *
 * Universe ids handed to this output are sACN universe numbers (1-63999).
 * If engine universe ids start at 0, set `universeOffset: 1` so engine
 * universe 0 maps to sACN universe 1.
 *
 * One CID per output instance (or pass `cid` in config to persist).
 * Per-universe sequence counters (E1.31 requires monotonic per universe).
 */
export class SacnOutput extends Output {
  static TYPE = 'sacn';

  constructor(config = {}) {
    super({ name: 'sACN', ...config });
    this.mode = config.mode ?? 'multicast';       // 'multicast' | 'unicast'
    this.host = config.host ?? null;              // unicast target
    this.port = config.port ?? SACN_PORT;
    this.sourceName = config.sourceName ?? 'Lumox';
    this.priority = config.priority ?? 100;
    this.cid = config.cid ?? generateCID();
    this.universeOffset = config.universeOffset ?? 1;
    this.bindAddress = config.bindAddress ?? '0.0.0.0';
    this._socket = null;
    this._sequences = new Map(); // universe → seq
  }

  async _openImpl() {
    await new Promise((resolve, reject) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('error', (err) => this.emit('error', err));
      sock.bind(0, this.bindAddress, () => {
        sock.setMulticastTTL(16);
        this._socket = sock;
        log.info(`open mode=${this.mode} ${this.mode === 'unicast' ? `→ ${this.host}` : ''} cid=${this.cid.toString('hex').slice(0, 8)}`);
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
    const sacnUni = (universe.id + this.universeOffset) & 0xffff;
    if (sacnUni < 1 || sacnUni > 63999) return;
    const seq = ((this._sequences.get(sacnUni) ?? -1) + 1) & 0xff;
    this._sequences.set(sacnUni, seq);

    const pkt = buildDataPacket({
      cid: this.cid,
      sourceName: this.sourceName,
      universe: sacnUni,
      priority: this.priority,
      sequence: seq,
      data,
    });

    const target = this.mode === 'unicast' ? this.host : multicastGroup(sacnUni);
    this._socket.send(pkt, 0, pkt.length, this.port, target);
  }
}
