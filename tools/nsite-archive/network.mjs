import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';
import WebSocket from 'ws';
import { RelayTransport } from '../relay-router/transport.mjs';
import { normalizeURL } from '../relay-router/validation.mjs';

const blocked4 = new BlockList(),
  blocked6 = new BlockList();
for (const [ip, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
])
  blocked4.addSubnet(ip, bits, 'ipv4');
for (const [ip, bits] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
])
  blocked6.addSubnet(ip, bits, 'ipv6');
export function publicIP(ip) {
  const family = isIP(ip);
  return family === 4
    ? !blocked4.check(ip, 'ipv4')
    : family === 6
      ? !blocked6.check(ip, 'ipv6')
      : false;
}
export class Network {
  constructor({ allowLocal = false, timeout = 10000, resolve = lookup, maxServers = 32 } = {}) {
    this.allowLocal = allowLocal;
    this.timeout = timeout;
    this.resolve = resolve;
    this.maxServers = maxServers;
  }
  url(value, httpMode = true) {
    return normalizeURL(value, { http: httpMode, allowLocal: this.allowLocal });
  }
  async destination(value, httpMode = true) {
    const url = new URL(this.url(value, httpMode));
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const all = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await this.resolve(host, { all: true });
    if (!all.length || (!this.allowLocal && all.some((x) => !publicIP(x.address))))
      throw Error('unsafe-dns-destination');
    const selected = all[0];
    // Pin the checked address to this connection: no second resolver lookup.
    const pinned = (_host, options, cb) =>
      options.all ? cb(null, [selected]) : cb(null, selected.address, selected.family);
    return { url, lookup: pinned };
  }
  async query(value, filter, limit = 64) {
    const dest = await this.destination(value, false),
      network = this;
    class SafeSocket extends WebSocket {
      constructor(url) {
        super(url, {
          lookup: dest.lookup,
          followRedirects: false,
          maxPayload: 2097152,
          handshakeTimeout: network.timeout,
        });
      }
    }
    return new RelayTransport({
      WebSocket: SafeSocket,
      timeout: this.timeout,
      maxBytes: 2097152,
    }).query(dest.url.href, filter, limit);
  }
  async get(value, { start = 0, signal, redirects = 0 } = {}) {
    const dest = await this.destination(value),
      driver = dest.url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = driver.get(
        dest.url,
        {
          lookup: dest.lookup,
          signal,
          headers: {
            'User-Agent': 'Pretend-Internet-nsite-archive/0.1 (read-only)',
            'Accept-Encoding': 'identity',
            ...(start ? { Range: `bytes=${start}-` } : {}),
          },
        },
        (res) => {
          res.on('error', () => {});
          if ([307, 308].includes(res.statusCode)) {
            res.destroy();
            try {
              const next = new URL(res.headers.location, dest.url);
              const hash = dest.url.pathname.match(/[0-9a-f]{64}/g)?.at(-1);
              if (redirects >= 3 || !hash || !next.pathname.includes(hash))
                throw Error('unsafe-redirect');
              resolve(this.get(next.href, { start, signal, redirects: redirects + 1 }));
            } catch (e) {
              reject(e);
            }
            return;
          }
          resolve(res);
        },
      );
      req.setTimeout(this.timeout, () => req.destroy(Error('network-timeout')));
      req.on('error', reject);
    });
  }
}
