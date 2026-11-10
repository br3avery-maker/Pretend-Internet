// Serves this app directory for browser verification and answers /<sha256>
// with the matching fixture body from pipeline-fixtures.json, including a
// single-range response. The collector fetches `${server}/${hash}` with Range,
// so the pipeline's continuity check needs real HTTP bytes, not a mock.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

export function fixtureBodies(){
  const file = path.join(root, 'test/pipeline-fixtures.json');
  const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bodies = new Map();
  for(const text of Object.values(fixture.item.files)){
    const bytes = Buffer.from(text);
    bodies.set(crypto.createHash('sha256').update(bytes).digest('hex'), bytes);
  }
  return bodies;
}

function parseRange(header){
  const match = /^bytes=(\d+)-(\d*)$/.exec(String(header || '').trim());
  if(!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : null;
  return {start, end};
}

export function startServer(port = 0){
  const bodies = fixtureBodies();
  const server = http.createServer((req, res) => {
    if(req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const fixture = bodies.get(pathname.slice(1));
    if(fixture){
      const range = parseRange(req.headers.range);
      res.setHeader('accept-ranges', 'bytes');
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('cache-control', 'no-store');
      if(!range){
        res.writeHead(200, {'content-length': String(fixture.length)});
        return res.end(req.method === 'HEAD' ? undefined : fixture);
      }
      const start = Math.min(range.start, fixture.length);
      const end = range.end === null ? fixture.length - 1 : Math.min(range.end, fixture.length - 1);
      if(start > end || start >= fixture.length){
        return res.writeHead(416, {'content-range': `bytes */${fixture.length}`}).end();
      }
      const slice = fixture.subarray(start, end + 1);
      res.writeHead(206, {
        'content-length': String(slice.length),
        'content-range': `bytes ${start}-${end}/${fixture.length}`,
      });
      return res.end(req.method === 'HEAD' ? undefined : slice);
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    if(target !== root && !target.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.stat(target, (error, stat) => {
      if(error || !stat.isFile()) return res.writeHead(404).end();
      res.writeHead(200, {
        'content-length': String(stat.size),
        'content-type': types[path.extname(target)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      if(req.method === 'HEAD') return res.end();
      fs.createReadStream(target).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      resolve({origin, close: () => new Promise(done => server.close(done))});
    });
  });
}

if(import.meta.url === `file://${process.argv[1]}`){
  const {origin} = await startServer(Number(process.argv[2] || process.env.PORT || 0));
  console.log(`Serving ${root} at ${origin}`);
}
