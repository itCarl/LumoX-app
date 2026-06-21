import { EventEmitter } from 'node:events';
import dgram from 'node:dgram';
import os from 'node:os';
import { ARTNET_PORT, buildArtPoll, parsePacket, portAddress } from '../protocols/artnet';
import type { PollReply } from '../protocols/artnet';
import { createLogger } from '../util/logger';

const log = createLogger('Discovery');

/** A DMX node found on the network via Art-Net ArtPollReply. Keyed by MAC. */
export interface DiscoveredDevice {
  mac: string;          // canonical key (lower-case colon hex); '' if the node sends none
  ip: string;           // last-seen address
  shortName: string;    // ArtPollReply ShortName (e.g. "Lumox")
  longName: string;     // ArtPollReply LongName
  universe: number;     // decoded 15-bit Art-Net port-address (net/subnet/swOut)
  net: number;
  subnet: number;
  oem: number;
  firmware: string;     // "major.minor" from VersInfo
  isLumox: boolean;     // name advertises a Lumox node
  firstSeen: number;
  lastSeen: number;     // epoch ms — drives decay
}

export type DiscoveryStatus = 'stopped' | 'running' | 'degraded';

export interface DiscoveryOptions {
  bindPort?: number;        // default 6454
  bindAddress?: string;     // default '0.0.0.0'
  pollIntervalMs?: number;  // ArtPoll cadence — default 3000
  expiryMs?: number;        // drop a node unseen for this long — default 30000
}

const DECAY_TICK_MS = 5000;

/**
 * DiscoveryService — finds Art-Net nodes by broadcasting ArtPoll and collecting
 * ArtPollReply. Uses one dedicated UDP socket bound to 6454 (separate from the
 * per-universe output sockets, which are send-only on ephemeral ports), so it
 * catches both solicited replies and a node's unsolicited periodic announcements.
 *
 * Events:
 *   'changed' (DiscoveredDevice[])  — the device set changed (new / updated / decayed)
 *   'status'  (DiscoveryStatus)     — running / degraded / stopped
 */
export class DiscoveryService extends EventEmitter {
  status: DiscoveryStatus = 'stopped';
  readonly bindPort: number;
  readonly bindAddress: string;
  readonly pollIntervalMs: number;
  readonly expiryMs: number;

  private _socket: dgram.Socket | null = null;
  private _devices = new Map<string, DiscoveredDevice>();
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _decayTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: DiscoveryOptions = {}) {
    super();
    this.bindPort = opts.bindPort ?? ARTNET_PORT;
    this.bindAddress = opts.bindAddress ?? '0.0.0.0';
    this.pollIntervalMs = opts.pollIntervalMs ?? 3000;
    this.expiryMs = opts.expiryMs ?? 30000;
  }

  /** Bind the listener and begin polling. No-op if already listening. On a bind
   *  conflict (another Art-Net app on 6454) it degrades instead of throwing. */
  async start(): Promise<void> {
    if (this._socket) return;
    await new Promise<void>((resolve) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('message', (msg, rinfo) => this._onMessage(msg, rinfo));
      const onBindError = (err: Error) => {
        log.warn(`bind :${this.bindPort} failed (${err.message}) — discovery degraded`);
        try { sock.close(); } catch { /* already closing */ }
        this._socket = null;
        this._setStatus('degraded');
        resolve();
      };
      sock.once('error', onBindError);
      sock.bind(this.bindPort, this.bindAddress, () => {
        sock.removeListener('error', onBindError);
        sock.on('error', (err) => log.error('socket error:', err.message));
        sock.setBroadcast(true);
        this._socket = sock;
        log.info(`listening on ${this.bindAddress}:${this.bindPort}`);
        this.poll();
        this._pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
        this._decayTimer = setInterval(() => this._decay(), DECAY_TICK_MS);
        this._setStatus('running');
        resolve();
      });
    });
  }

  /** Stop polling and release the socket. Idempotent; safe if never started. */
  async stop(): Promise<void> {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
    if (this._decayTimer) { clearInterval(this._decayTimer); this._decayTimer = null; }
    const sock = this._socket;
    this._socket = null;
    this._setStatus('stopped');
    if (sock) {
      sock.removeAllListeners();
      await new Promise<void>((res) => sock.close(res));
    }
  }

  /** Snapshot of known devices — Lumox nodes first, then by IP. */
  list(): DiscoveredDevice[] {
    return [...this._devices.values()].sort((a, b) =>
      Number(b.isLumox) - Number(a.isLumox) || a.ip.localeCompare(b.ip, undefined, { numeric: true }));
  }

  /** Send one ArtPoll to the limited broadcast and every interface's directed
   *  broadcast (limited broadcast alone isn't routed to every subnet on Windows). */
  poll(): void {
    if (!this._socket) return;
    const pkt = buildArtPoll();
    for (const target of new Set(['255.255.255.255', ...directedBroadcasts()])) {
      this._socket.send(pkt, 0, pkt.length, this.bindPort, target, (err) => {
        if (err) log.debug(`poll -> ${target} failed: ${err.message}`);
      });
    }
  }

  private _onMessage(buf: Buffer, rinfo: dgram.RemoteInfo): void {
    const pkt = parsePacket(buf);
    if (pkt?.reply) this._ingest(pkt.reply, rinfo);
  }

  private _ingest(reply: PollReply, rinfo: dgram.RemoteInfo): void {
    const mac = reply.mac && reply.mac !== '00:00:00:00:00:00' ? reply.mac : '';
    const ip = reply.ip && reply.ip !== '0.0.0.0' ? reply.ip : rinfo.address;
    const key = mac || ip;
    if (!key) return;
    const now = Date.now();
    const prev = this._devices.get(key);
    const device: DiscoveredDevice = {
      mac, ip,
      shortName: reply.shortName,
      longName: reply.longName,
      universe: portAddress(reply.netSwitch, reply.subSwitch, reply.swOut[0] ?? 0),
      net: reply.netSwitch,
      subnet: reply.subSwitch,
      oem: reply.oem,
      firmware: `${reply.versInfo >> 8}.${reply.versInfo & 0xff}`,
      isLumox: /lumox/i.test(reply.longName) || /lumox/i.test(reply.shortName),
      firstSeen: prev?.firstSeen ?? now,
      lastSeen: now,
    };
    this._devices.set(key, device);
    if (!prev || signature(prev) !== signature(device)) this._emitChanged();
  }

  private _decay(): void {
    const cutoff = Date.now() - this.expiryMs;
    let removed = false;
    for (const [key, d] of this._devices) {
      if (d.lastSeen < cutoff) { this._devices.delete(key); removed = true; }
    }
    if (removed) this._emitChanged();
  }

  private _emitChanged(): void { this.emit('changed', this.list()); }

  private _setStatus(status: DiscoveryStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit('status', status);
  }
}

/** Identity of the user-visible fields — re-emit 'changed' only when these move. */
function signature(d: DiscoveredDevice): string {
  return `${d.mac}|${d.ip}|${d.universe}|${d.shortName}|${d.firmware}`;
}

/** Per-interface directed broadcast addresses (ip | ~mask), IPv4, non-internal. */
function directedBroadcasts(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.internal || a.family !== 'IPv4') continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      if (ip.length === 4 && mask.length === 4) {
        out.push(ip.map((o, i) => o | (~mask[i] & 0xff)).join('.'));
      }
    }
  }
  return out;
}
