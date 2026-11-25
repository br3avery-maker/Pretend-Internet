import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { npubEncode } from 'nostr-tools/nip19';
import { matchFilter } from 'nostr-tools/filter';

const build = resolve(import.meta.dirname, '../dist');
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.webp':'image/webp', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const server = createServer(async (request,response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    const full = resolve(build, path);
    if (!full.startsWith(build + '/')) throw new Error('Outside build');
    response.writeHead(200,{ 'Content-Type':types[extname(full)] || 'application/octet-stream' });
    response.end(await readFile(full));
  } catch { response.end('Unavailable'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH && { executablePath: process.env.CHROMIUM_PATH }),
  args: ['--no-sandbox'],
});
const secret = generateSecretKey();
const pubkey = getPublicKey(secret);
const another = generateSecretKey();
const secondaryPubkey = getPublicKey(another);
const time = Math.floor(Date.now() / 1000) - 8;
const sign = (kind, content, tags = [], key = secret) => finalizeEvent({ kind, content, tags, created_at: time }, key);
const events = [
  sign(0, JSON.stringify({ display_name:'Reader Test' })),
  sign(0, JSON.stringify({ display_name:'Second Profile' }), [], another),
  sign(10002, '', [['r','wss://relay.ditto.pub']]),
  sign(10063, '', [['server','https://blossom.fixture.example']]),
  sign(35128, '', [['d','test-arcade'],['title','Test arcade'],['description','A game in the arcade'],['path','/index.html','d'.repeat(64)]]),
  sign(30023, '# Example article\n\nThis article came from a signed event.', [['d','article'],['title','Example article']]),
  sign(36787, '', [['d','track'],['title','Fixture song'],['artist','Fixture artist'],['url','https://media.fixture.example/fixture.wav']]),
  sign(34139, '', [['d','library'],['title','Fixture playlist'],['a',`36787:${pubkey}:track`]]),
  sign(0, JSON.stringify({ display_name:'Tampered' }), [], another),
];
events.at(-1).content = '{"display_name":"Bad signature"}';
const writes = [];
let uploads = 0;
let remoteSiteRequests = 0;
const uncaught = [];
const context = await browser.newContext({
  viewport: { width:393,height:852 }, isMobile: true, hasTouch: true,
});
await context.routeWebSocket(/^wss:\/\//, connection => {
  connection.onMessage(data => {
    const [verb,id,filter] = JSON.parse(data);
    if (verb === 'REQ') {
      for (const event of events.filter(event => matchFilter(filter,event)).slice(0,filter.limit ?? 100))
        connection.send(JSON.stringify(['EVENT',id,event]));
      connection.send(JSON.stringify(['EOSE',id]));
    } else if (verb === 'EVENT') {
      assert.equal(verifyEvent(id),true);
      writes.push(id);
      events.unshift(id);
      connection.send(JSON.stringify(['OK',id.id,true,'']));
    }
  });
});
const blobMap = new Map();
await context.route('https://blossom.fixture.example/**', async request => {
  const req = request.request();
  const path = new URL(req.url()).pathname;
  if (req.method() === 'PUT' && path === '/upload') {
    const data = req.postDataBuffer();
    const hash = createHash('sha256').update(data).digest('hex');
    const encoded = req.headers().authorization.replace(/^Nostr /, '');
    const authorization = JSON.parse(Buffer.from(encoded,'base64url').toString());
    assert.equal(verifyEvent(authorization), true);
    assert.ok(authorization.tags.some(parts => parts[0] === 'x' && parts[1] === hash));
    uploads++;
    blobMap.set(hash,data);
    return request.fulfill({ headers: { 'access-control-allow-origin':'*', 'content-type':'application/json' },
      body: JSON.stringify({ url:'https://blossom.fixture.example/' + hash, sha256:hash }) });
  }
  if (req.method() === 'OPTIONS') return request.fulfill({ status:204, headers:{ 'access-control-allow-origin':'*','access-control-allow-methods':'PUT, GET, OPTIONS','access-control-allow-headers':'*' } });
  const data = blobMap.get(path.slice(1));
  return request.fulfill({ status:data?200:404, headers:{ 'access-control-allow-origin':'*' }, body:data || '' });
});
await context.route('https://media.fixture.example/fixture.wav', async request => {
  const data = Buffer.alloc(44 + 16000 * 5, 0);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ',8);
  data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22);
  data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34);
  data.write('data',36); data.writeUInt32LE(data.length - 44,40);
  await request.fulfill({ contentType:'audio/wav', body:data });
});
await context.route('https://*.nsite.lol/**', request => {
  remoteSiteRequests++;
  return request.fulfill({ contentType:'text/html', body:'<h1>Fixture arcade</h1><button onclick="this.textContent=\'Game action completed\'">Play one move</button>' });
});
await context.exposeBinding('fixtureGetKey', () => pubkey);
await context.exposeBinding('fixtureSign', (_source, template) => finalizeEvent(template, secret));
await context.addInitScript(() => {
  window.nostr = { getPublicKey:() => window.fixtureGetKey(), signEvent:template => window.fixtureSign(template) };
});
const page = await context.newPage();
page.on('pageerror', error => uncaught.push(error.message));
page.setDefaultTimeout(10000);
const h1 = (line, exact=true) => page.getByRole('heading',{level:1,name:line,exact});
const button = (name, exact=true) => page.getByRole('button',{name,exact});
const link = (name, exact=true) => page.getByRole('link',{name,exact});
const open = path => page.goto(origin + '/' + path);
async function snap(name) {
  const dir = process.env.CHECK_SCREENSHOT_DIR;
  if (!dir) return;
  await mkdir(dir,{recursive:true});
  await page.screenshot({path:resolve(dir,name+'.png')});
}
try {
  await open('index.html');
  await h1('Pretend Internet').waitFor();
  assert.equal(await page.locator('main a.destination').count(),7);
  await snap('home');
  await page.evaluate(() => navigator.serviceWorker.ready);

  await open('profile.html');
  await page.getByLabel('Public Nostr key').fill(npubEncode(pubkey));
  await button('Add profile').click();
  await page.getByRole('heading',{name:'Reader Test'}).waitFor();
  await page.getByLabel('Public Nostr key').fill(npubEncode(secondaryPubkey));
  await button('Add profile').click();
  await page.getByRole('heading',{name:'Second Profile'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Bad signature'}).count(),0);
  await page.locator('article').filter({hasText:'Reader Test'}).getByRole('button',{name:'Use profile'}).click();
  await page.getByText('Active browsing profile').waitFor();
  await open('network.html');
  await h1('Network').waitFor();
  await page.getByText('https://blossom.fixture.example',{exact:true}).waitFor();

  await open('discover.html');
  await button('Refresh').click();
  await link('Test arcade').waitFor();
  assert.equal(remoteSiteRequests,0);
  await link('Test arcade').click();
  await h1('Test arcade').waitFor();
  await button('Save site').click();
  await button('Hide all from this publisher').click();
  await open('discover.html');
  assert.equal(await link('Test arcade').count(),0);
  await page.getByLabel('Hidden publishers').check();
  await link('Test arcade').click();
  await button('Show this publisher').click();
  await open('arcade.html');
  const [game] = await Promise.all([context.waitForEvent('page'),page.getByRole('link',{name:'Play',exact:true}).click()]);
  await game.getByRole('button',{name:'Play one move'}).click();
  await game.getByRole('button',{name:'Game action completed'}).waitFor();
  await game.close();
  assert.equal(remoteSiteRequests,1);
  await snap('arcade');

  await open('music.html');
  await button('Refresh music').click();
  await page.getByRole('heading',{name:'Fixture song'}).waitFor();
  await page.getByLabel('Playlist').selectOption({label:'Fixture playlist'});
  await button('Play').click();
  await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 0);
  await snap('music');

  await open('writing.html');
  await button('Find writing').click();
  await link('Example article',false).click();
  await link('Read').click();
  await page.getByText('This article came from a signed event.').waitFor();

  await open('library.html');
  await snap('bookshelf');
  await link('The Loopy Library',false).first().click();
  await link('Read').click();
  await button('Bookmark').click();
  await button('Saved').waitFor();
  await page.evaluate(() => {
    const article = document.querySelector('article');
    function swipe(type,x) {
      const touch = new Touch({identifier:1,target:article,clientX:x,clientY:490});
      article.dispatchEvent(new TouchEvent(type,{bubbles:true,changedTouches:[touch],touches:type==='touchend'?[]:[touch]}));
    }
    swipe('touchstart',300);
    swipe('touchend',120);
  });
  await page.getByText('2 of 6').waitFor();
  await page.evaluate(() => window.scrollTo(0,300));
  await page.waitForFunction(() => document.body.classList.contains('reader-hidden'));
  const y = await page.evaluate(() => window.scrollY);
  await page.reload();
  await page.getByText('2 of 6').waitFor();
  assert.equal(await page.evaluate(() => window.scrollY),y);
  await snap('reader');
  await context.setOffline(true);
  await open('reader.html?book=origin');
  await page.getByText('2 of 6').waitFor();
  await context.setOffline(false);
  await open('curate.html');
  const path = page.getByLabel('Markdown or text file');
  await path.setInputFiles({name:'Test Book.md',mimeType:'text/markdown',buffer:Buffer.from('# One\n\nHello!\n\n# Two\n\nAgain.')});
  await button('Import document').click();
  await page.getByLabel('Add to collection').fill('Fixture shelf');
  await button('Save changes').click();
  await page.getByRole('heading',{name:'Fixture shelf'}).waitFor();

  await open('publish.html');
  await button('Connect signer').click();
  await button('Use browser signer').click();
  await page.getByText(/^Signing as/).filter({visible:true}).waitFor();
  await page.getByLabel('Publication type').selectOption('nsite');
  await page.getByLabel('Title',{exact:true}).fill('Disposable browser fixture');
  await page.getByLabel('Stable identifier for updates').fill('test-site');
  await page.getByLabel('HTML or ZIP').setInputFiles({name:'fixture.html',mimeType:'text/html',buffer:Buffer.from('<h1>Fixture</h1>')});
  await page.getByText(/1 staged files/).waitFor();
  await page.getByLabel('Blossom server').selectOption('https://blossom.fixture.example');
  await button('Review publication').click();
  await page.getByRole('dialog',{name:'Review public publication'}).waitFor();
  assert.equal(writes.length,0,'Review does not publish');
  assert.equal(uploads,0,'Review does not upload');
  await snap('publish-review');
  await button('Sign and publish').click();
  await page.getByText('The signed event was independently read back from every selected relay.').waitFor();
  assert.equal(writes.length,1);
  assert.equal(writes[0].kind,35128);
  assert.equal(uploads,1);
  await page.getByText(/Verified by relay readback/).waitFor();
  await page.reload();
  await page.getByText(/Verified by relay readback/).waitFor();

  assert.deepEqual(uncaught,[]);
  console.log('Mobile Chromium passed profiles, metadata-only discovery, game handoff, music playback, long-form writing, reader swipe and offline resume, Markdown curation, and disposable nsite signing and verification.');
} finally {
  await browser.close();
  server.close();
}
