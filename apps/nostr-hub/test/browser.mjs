import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { npubEncode } from 'nostr-tools/nip19';
import { zipSync } from 'fflate';
import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44';
import { matchFilter } from 'nostr-tools/filter';

const build = resolve(process.env.APP_BUILD_DIR || resolve(import.meta.dirname, '../dist'));
const packaged = (await readFile(resolve(build, 'profile.html'), 'utf8')).includes('name="pretend-amber-return"');
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
const brokerKey = generateSecretKey();
const broker = getPublicKey(brokerKey);
let client;
let resumed;
let connections = 0;
const time = Math.floor(Date.now() / 1000) - 8;
const sign = (kind, content, tags = [], key = secret) => finalizeEvent({ kind, content, tags, created_at: time }, key);
const events = [
  sign(0, JSON.stringify({ display_name:'Reader Test' })),
  sign(0, JSON.stringify({ display_name:'Second Profile' }), [], another),
  sign(10002, '', [['r','wss://relay.ditto.pub']]),
  sign(10063, '', [['server','https://blossom.fixture.example']]),
  sign(35128, '', [['d','test-arcade'],['title','Test arcade'],['description','A game in the arcade'],['path','/index.html','d'.repeat(64)]]),
  sign(10000, '', [['p',pubkey]], another),
  sign(30023, 'Other profile article', [['d','other'],['title','Other profile article']], another),
  sign(30023, '# Example article\n\nThis article came from a signed event.', [['d','article'],['title','Example article']]),
  sign(36787, '', [['d','track'],['title','Fixture song'],['artist','Fixture artist'],['url','https://media.fixture.example/fixture.wav']]),
  sign(36787, '', [['d','second'],['title','Second fixture song'],['url','https://media.fixture.example/fixture.wav']]),
  sign(36787, '', [['d','third'],['title','Third fixture song'],['url','https://media.fixture.example/fixture.wav']], another),
  sign(34139, '', [['d','library'],['title','Fixture playlist'], ...['track','second'].map(id => ['a',`36787:${pubkey}:${id}`]), ['a',`36787:${secondaryPubkey}:third`]]),
  sign(0, JSON.stringify({ display_name:'Tampered' }), [], another),
];
events.at(-1).content = '{"display_name":"Bad signature"}';
const writes = [];
let uploads = 0;
let authentications = 0;
let authenticatedAddressReads = 0;
let remoteSiteRequests = 0;
const uncaught = [];
const context = await browser.newContext({
  viewport: { width:393,height:852 }, isMobile: true, hasTouch: true,
});
await context.routeWebSocket(/^wss:\/\//, connection => {
  let authenticated = false;
  const subscriptions = new Map();
  connection.onMessage(data => {
    const [verb,id,filter] = JSON.parse(data);
    if (verb === 'REQ') {
      const addressRead = filter.limit === 25 && filter.kinds?.includes(35128) && /relay\.ditto\.pub/.test(connection.url());
      if ((filter.ids || addressRead) && !authenticated) {
        connection.send(JSON.stringify(['AUTH','fixture-read-challenge']));
        connection.send(JSON.stringify(['CLOSED',id,'auth-required: authenticate to read this event']));
        return;
      }
      if (addressRead && authenticated) authenticatedAddressReads++;
      subscriptions.set(id,filter);
      for (const event of events.filter(event => matchFilter(filter,event)).slice(0,filter.limit ?? 100))
        connection.send(JSON.stringify(['EVENT',id,event]));
      connection.send(JSON.stringify(['EOSE',id]));
    } else if (verb === 'CLOSE') {
      subscriptions.delete(id);
    } else if (verb === 'AUTH') {
      assert.equal(verifyEvent(id),true);
      assert.equal(id.kind,22242);
      assert.equal(id.pubkey,pubkey);
      assert.ok(id.tags.some(parts => parts[0] === 'challenge' && parts[1] === 'fixture-read-challenge'));
      authenticated = true;
      authentications++;
      connection.send(JSON.stringify(['OK',id.id,true,'']));
    } else if (verb === 'EVENT') {
      assert.equal(verifyEvent(id),true);
      if (id.kind === 24133) {
        assert.equal(id.tags.find(parts => parts[0] === 'p')[1],broker);
        const key = getConversationKey(brokerKey,id.pubkey);
        const request = JSON.parse(decrypt(id.content,key));
        let result;
        if (request.method === 'connect') {
          assert.equal(request.params[1],'fixture-consent');
          client = id.pubkey;
          connections++;
          result = 'ack';
        } else {
          assert.equal(id.pubkey,client);
          if (request.method === 'get_public_key') { resumed = id.pubkey; result = pubkey; }
          if (request.method === 'sign_event') result = JSON.stringify(finalizeEvent(JSON.parse(request.params[0]),secret));
        }
        const reply = finalizeEvent({ kind:24133, content:encrypt(JSON.stringify({ id:request.id,result }),key),
          tags:[['p',id.pubkey]], created_at:Math.floor(Date.now()/1000) },brokerKey);
        connection.send(JSON.stringify(['OK',id.id,true,'']));
        for (const [sub,filter] of subscriptions) {
          if (matchFilter(filter,reply)) connection.send(JSON.stringify(['EVENT',sub,reply]));
        }
        return;
      }
      writes.push(id);
      events.unshift(id);
      connection.send(JSON.stringify(['OK',id.id,true,'']));
    }
  });
});
const blobMap = new Map();
let failedPrimary = 0;
await context.route('https://blossom.primal.net/**', async request => {
  if (request.request().method() === 'OPTIONS') return request.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'PUT,GET,OPTIONS','access-control-allow-headers':'*'}});
  if (request.request().method() === 'PUT') failedPrimary++;
  return request.fulfill({status:503,headers:{'access-control-allow-origin':'*'},body:'Fixture unavailable'});
});
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
await context.route(/^https:\/\/(relay\.ditto\.pub|relay\.primal\.net|purplepag\.es)(\/|$)/, request => request.fulfill({contentType:'application/nostr+json',body:'{}'}));
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
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="nostrsigner:"]');
    if (!link) return;
    event.preventDefault();
    window.lastAmberURI = link.getAttribute('href');
  });
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(...args) {
    if (this.name === 'files' && window.failStagedWrite) throw new Error('Fixture storage failure');
    return put.apply(this,args);
  };
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
  await page.setViewportSize({width:320,height:740});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  await page.setViewportSize({width:393,height:852});
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
  await button('Check connections').click();
  await page.getByText('Relay check complete.').waitFor();
  assert.ok(await page.getByRole('list',{name:'Relay check results'}).getByText('Responded',{exact:false}).count());

  await open('writing.html');
  await button('Find writing').click();
  await link('Example article',false).waitFor();
  await open('profile.html');
  await page.locator('article').filter({hasText:'Second Profile'}).getByRole('button',{name:'Use profile'}).click();
  await open('writing.html');
  await button('Find writing').click();
  await link('Other profile article',false).waitFor();
  assert.equal(await link('Example article',false).count(),0);
  await open('profile.html');
  await page.getByText('1 public muted publishers; 0 muted events.').waitFor();
  await page.locator('article').filter({hasText:'Reader Test'}).getByRole('button',{name:'Use profile'}).click();
  await open('discover.html');
  await button('Refresh').click();
  await link('Test arcade').waitFor();
  await button('Load older').click();
  await page.getByText(/signed events returned in this historical page/).waitFor();
  await page.getByText(/Relay history is not proof of network-wide completeness/).waitFor();
  assert.equal(remoteSiteRequests,0);
  await link('Test arcade').click();
  await h1('Test arcade').waitFor();
  await button('Save site').click();
  await button('Hide all from this publisher').click();
  await open('discover.html');
  assert.equal(await link('Test arcade').count(),0);
  await open('writing.html');
  assert.equal(await link('Example article',false).count(),0);
  await open('discover.html');
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
  await page.getByRole('heading',{name:'Fixture song',exact:true}).waitFor();
  await page.getByText('3 tracks and 1 playlists available.').waitFor();
  assert.equal(await page.getByRole('region',{name:'Tracks'}).getByRole('heading',{name:'Third fixture song',exact:true}).count(),0);
  await page.getByLabel('Playlist').selectOption({label:'Fixture playlist'});
  await page.getByRole('region',{name:'Tracks'}).getByRole('heading',{name:'Third fixture song',exact:true}).waitFor();
  await page.getByRole('region',{name:'Tracks'}).locator('article').filter({hasText:'Second fixture song'}).getByRole('button',{name:'Play'}).click();
  await page.waitForFunction(() => document.querySelector('audio')?.currentTime > 0);
  const playing = name => page.getByRole('heading',{level:2,name,exact:true});
  await button('Refresh music').click();
  await page.getByText('3 tracks and 1 playlists available.').waitFor();
  await button('Next track').click();
  await playing('Third fixture song').waitFor();
  await button('Refresh music').click();
  await page.getByText('3 tracks and 1 playlists available.').waitFor();
  await button('Previous track').click();
  await playing('Second fixture song').waitFor();
  await button('Refresh music').click();
  await page.getByText('3 tracks and 1 playlists available.').waitFor();
  await page.locator('audio').dispatchEvent('ended');
  await playing('Third fixture song').waitFor();
  events.push(finalizeEvent({kind:36787,content:'',created_at:time+1,tags:[['d','third'],['title','Updated third fixture song'],['url','https://media.fixture.example/fixture.wav']]},another));
  await button('Refresh music').click();
  await page.getByRole('region',{name:'Tracks'}).getByRole('heading',{name:'Updated third fixture song',exact:true}).waitFor();
  await snap('music');

  await open('writing.html');
  await button('Find writing').click();
  await link('Example article',false).click();
  await link('Read').click();
  await page.getByText('This article came from a signed event.').waitFor();

  await open('library.html');
  await page.waitForFunction(() => {
    const covers = [...document.querySelectorAll('.shelf img')];
    return covers.length === 2 && covers.every(image => image.naturalWidth > 0);
  });
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
  await page.waitForURL(/book=local%3A/);
  await page.getByLabel('Add to collection').fill('Fixture shelf');
  await button('Save changes').click();
  await page.getByRole('heading',{name:'Fixture shelf'}).waitFor();

  await open('discover.html');
  await page.getByLabel('Publisher npub').fill(npubEncode(pubkey));
  await button('Find published nsites').click();
  await page.getByText('Found 1 published nsite.').waitFor();
  assert.ok((await link('Open site').getAttribute('href')).startsWith('https://'));

  await open('index.html');
  await button('Open profile menu').click();
  await page.getByRole('dialog').getByRole('link',{name:'Sign in',exact:true}).click();
  await button('Sign in with browser signer').click();
  await page.getByText('Signed in with a browser signer').waitFor();
  await open('publish.html');
  await page.getByText(/^Publishing as/).waitFor();
  assert.equal(await button('Connect signer').count(),0);
  await page.getByLabel('Publication type').selectOption('nsite');
  await page.getByLabel('Title',{exact:true}).fill('Disposable browser fixture');
  await page.getByLabel('Stable identifier for updates').fill('test-site');
  const siteFile = page.getByLabel('HTML, ZIP, Markdown or text');
  const replacementRequired = 'Choose valid replacement files before publishing.';
  const review = page.getByRole('dialog',{name:'Review public publication'});
  const oldSite = Buffer.from('<h1>Old selection</h1>');
  const newSite = Buffer.from('<h1>New selection</h1>');
  const chooseHTML = content => siteFile.setInputFiles({name:'fixture.html',mimeType:'text/html',buffer:content});
  await chooseHTML(oldSite);
  await page.getByText(/1 staged files/).waitFor();
  await chooseHTML(Buffer.alloc(0));
  await page.getByText('The folder or ZIP needs a nonempty index.html entry.').waitFor();
  await button('Review publication').click();
  await page.getByText(replacementRequired).waitFor();
  assert.equal(await review.count(),0);
  await chooseHTML(oldSite);
  await page.getByText(/1 staged files/).waitFor();
  await page.evaluate(() => { window.failStagedWrite = true; });
  await chooseHTML(newSite);
  await page.getByText('Fixture storage failure').waitFor();
  await button('Review publication').click();
  await page.getByText(replacementRequired).waitFor();
  assert.equal(await review.count(),0);
  await page.getByLabel('Publication type').selectOption('note');
  await page.getByLabel('Publication type').selectOption('nsite');
  await page.getByText(replacementRequired).waitFor();
  assert.equal(await page.getByText(/1 staged files/).count(),0);
  await page.reload();
  await page.getByText(replacementRequired).waitFor();
  await page.getByText(/^Publishing as/).filter({visible:true}).waitFor();
  await button('Review publication').click();
  assert.equal(await review.count(),0);
  const style = Buffer.from('body { font-family: sans-serif; }');
  const logo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await siteFile.setInputFiles({name:'site.zip',mimeType:'application/zip',
    buffer:Buffer.from(zipSync({'index.html':newSite,'style.css':style,'assets/logo.svg':logo}))});
  await page.getByText(/3 staged files/).waitFor();
  await page.getByLabel('Blossom server').selectOption('https://blossom.primal.net');
  await page.locator('input[type=checkbox][value="https://blossom.fixture.example"]').check();
  await button('Review publication').click();
  await review.getByText('Approved fallback upload destinations, in order:').waitFor();
  await page.getByRole('dialog',{name:'Review public publication'}).waitFor();
  assert.equal(writes.length,0,'Review does not publish');
  assert.equal(uploads,0,'Review does not upload');
  await snap('publish-review');
  await button('Sign and publish').click();
  const verifiedSite = 'The reviewed version is current on every selected relay. Its Blossom files were verified.';
  await page.getByText(verifiedSite).waitFor();
  assert.equal(writes.length,1);
  assert.equal(writes[0].kind,35128);
  assert.equal(uploads,3);
  assert.equal(failedPrimary,1);
  assert.ok(writes[0].tags.some(row => row[0]==='server' && row[1]==='https://blossom.fixture.example'));
  assert.ok(authentications >= 2);
  assert.ok(authenticatedAddressReads >= 2, 'Authenticated nsite address preflight and readback');
  assert.ok([...blobMap.values()].some(data => data.equals(newSite)));
  await page.getByText(/Verified by relay readback/).waitFor();
  await page.reload();
  await page.getByText(/Verified by relay readback/).waitFor();

  await button('Review publication').click();
  await page.getByText('This address has already been published. Choose Update existing nsite.').waitFor();
  await page.getByLabel('Nsite action').selectOption('update');
  const selectedSite = page.getByLabel('Published nsite');
  const selectedTitle = page.getByLabel('Title',{exact:true});
  await selectedSite.selectOption('35128:' + pubkey + ':test-arcade');
  assert.equal(await selectedTitle.inputValue(),'Test arcade');
  await selectedTitle.fill('An edited arcade draft');
  await selectedSite.selectOption('35128:' + pubkey + ':test-site');
  assert.equal(await selectedTitle.inputValue(),'Disposable browser fixture');
  await selectedSite.selectOption('35128:' + pubkey + ':test-arcade');
  assert.equal(await selectedTitle.inputValue(),'An edited arcade draft');
  await selectedSite.selectOption('35128:' + pubkey + ':test-site');
  const revised = Buffer.from('<h1>Changed index only</h1>');
  await page.getByLabel('File or ZIP of changes').setInputFiles({name:'index.html',mimeType:'text/html',buffer:revised});
  await page.getByText(/1 staged files/).waitFor();
  await button('Review publication').click();
  await review.getByText('Change /index.html').waitFor();
  await review.getByText('Keep /style.css').waitFor();
  await review.getByText('Keep /assets/logo.svg').waitFor();
  assert.ok(await review.getByText(npubEncode(pubkey),{exact:true}).count());
  await button('Sign and publish').click();
  await page.getByText(verifiedSite).waitFor();
  assert.equal(writes.length,2);
  const pathTags = event => event.tags.filter(parts => parts[0] === 'path');
  assert.deepEqual(pathTags(writes[1]).filter(parts => parts[1] !== '/index.html'),
    pathTags(writes[0]).filter(parts => parts[1] !== '/index.html'));
  assert.equal(writes[1].pubkey, writes[0].pubkey);
  assert.equal(writes[1].tags.find(parts => parts[0] === 'd')[1], 'test-site');

  await page.getByLabel('Nsite action').selectOption('restore');
  await button('Find my published nsites').click();
  await page.getByLabel('Saved version to restore').selectOption(writes[0].id);
  await button('Review publication').click();
  await review.getByText('Change /index.html').waitFor();
  await button('Sign and publish').click();
  await page.getByText(verifiedSite).waitFor();
  assert.equal(writes.length,3);
  assert.deepEqual(pathTags(writes[2]),pathTags(writes[0]));

  if (packaged) {
    await open('index.html');
    await button('Open profile menu').click();
    await page.getByRole('dialog').getByRole('link',{name:'Manage account'}).click();
    await page.getByText('Change signer',{exact:true}).click();
    await button('Switch account in Amber').click();
    const getHandoff = () => page.evaluate(() => window.lastAmberURI);
    function callbackTarget(handoff) {
      const callback = new URL(new URL(handoff).searchParams.get('callbackUrl'));
      assert.equal(callback.protocol,'pretend-internet-amber:');
      assert.equal(callback.hostname,'oauth-return');
      return new URL(callback.searchParams.get('url'));
    }
    const signinHandoff = await getHandoff();
    const signInPage = callbackTarget(signinHandoff);
    assert.equal(new URL(signinHandoff).searchParams.get('type'),'get_public_key');
    assert.equal(signInPage.pathname,'/profile.html');
    assert.equal(signInPage.searchParams.get('signin'),'1');
    const reply = (target, value) => page.evaluate(url => { location.href = url; }, target.href + encodeURIComponent(value));
    const stale = new URL(signInPage.href);
    stale.hash = '#amber-return=old:';
    await reply(stale,npubEncode(secondaryPubkey));
    await page.waitForFunction(() => location.hash === '');
    assert.equal(await page.getByText('Signed in with a browser signer').count(),1);
    await reply(signInPage,npubEncode(pubkey));
    await page.getByText('Signed in with Amber').waitFor();
    await page.reload();
    await page.getByText('Signed in with Amber').waitFor();

    await open('publish.html');
    await page.getByText(/^Publishing as/).waitFor();
    await page.getByLabel('Publication type').selectOption('note');
    await page.getByLabel('Note',{exact:true}).fill('Amber test? & OLED');
    await button('Review publication').click();
    const approval = page.getByRole('dialog',{name:'Approve in Amber'});
    const send = review.getByRole('button',{name:'Sign and publish'});
    await send.click();
    await approval.waitFor();
    assert.equal(await approval.locator('textarea, input').count(),0);
    await approval.getByRole('button',{name:'Close'}).click();
    await review.getByText('Amber request cancelled.').waitFor();
    assert.equal(writes.length,3);

    await send.click();
    await approval.getByRole('link',{name:'Open Amber'}).click();
    let handoff = await getHandoff();
    let request = new URL(handoff);
    let template = JSON.parse(decodeURIComponent(request.pathname));
    await reply(callbackTarget(handoff),finalizeEvent({...template,content:'Wrong content'},secret).sig);
    await review.getByText('The signature did not match this request or Amber account.').waitFor();
    assert.equal(writes.length,3);

    await send.click();
    for (const kind of [1,22242]) {
      await approval.getByRole('link',{name:'Open Amber'}).click();
      const next = await getHandoff();
      assert.notEqual(next,handoff);
      handoff = next;
      request = new URL(handoff);
      template = JSON.parse(decodeURIComponent(request.pathname));
      assert.equal(template.kind,kind);
      assert.equal(template.pubkey,pubkey);
      assert.deepEqual(JSON.parse(decodeURIComponent(handoff.slice('nostrsigner:'.length)).split('?')[0]),template);
      const target = callbackTarget(handoff);
      assert.equal(target.pathname,'/publish.html');
      await reply(target,finalizeEvent(template,secret).sig);
    }
    await page.getByText('The signed event was independently read back from every selected relay.').waitFor();
    assert.equal(writes.at(-1).content,'Amber test? & OLED');
    assert.equal(new URL(page.url()).hash,'');
  } else {
    await open('profile.html');
    assert.equal(await button('Sign in with Amber').count(),0);
  }

  await open('profile.html');
  await page.getByText('Change signer',{exact:true}).click();
  const remote = page.getByRole('region',{name:'Sign-in account'});
  await remote.getByText('Remote signer',{exact:true}).click();
  await remote.getByLabel('Bunker connection link').fill('bunker://' + broker + '?relay=wss%3A%2F%2Fbroker.fixture.example&secret=fixture-consent');
  await remote.getByRole('button',{name:'Connect bunker link'}).click();
  await page.getByText('Signed in with a remote signer').waitFor();
  await open('publish.html');
  await page.locator('main').getByText(/^Publishing as/).waitFor();
  resumed = undefined;
  await page.reload();
  await page.locator('main').getByText(/^Publishing as/).waitFor();
  assert.equal(resumed,client);
  assert.equal(connections,1);
  await page.getByLabel('Publication type').selectOption('note');
  await page.getByLabel('Note',{exact:true}).fill('Remote session survived reload');
  await button('Review publication').click();
  await button('Sign and publish').click();
  await page.getByText('The signed event was independently read back from every selected relay.').waitFor();
  assert.equal(writes.at(-1).content,'Remote session survived reload');
  await page.getByLabel('Publication type').selectOption('nsite');
  await page.getByLabel('Nsite action').selectOption('create');
  await page.getByLabel('Title',{exact:true}).fill('');
  await page.getByLabel('Stable identifier for updates').fill('');
  await page.getByLabel('HTML, ZIP, Markdown or text').setInputFiles({name:'test.md',mimeType:'text/markdown',
    buffer:Buffer.from('# A new story\n\nA formatted paragraph.')});
  await page.waitForFunction(() => [...document.querySelectorAll('main label')].find(label => label.firstChild?.textContent === 'Title')?.querySelector('input').value === 'A new story');
  assert.equal(await page.getByLabel('Stable identifier for updates').inputValue(),'a-new-story');
  await open('help.html');
  const downloadPromise=page.waitForEvent('download',{timeout:20000});
  void downloadPromise.catch(()=>{});
  await button('Export local backup').click();
  await page.locator('main [role=status]:not([hidden])').waitFor();
  assert.match(await page.locator('main [role=status]:not([hidden])').textContent(),/Backup bytes validated/);
  const download=await downloadPromise;
  const archive=await download.path();
  const recoveredContext=await browser.newContext();
  const recoveredPage=await recoveredContext.newPage();
  await recoveredPage.goto(origin+'/help.html');
  await recoveredPage.getByLabel('Backup ZIP').setInputFiles(archive);
  await recoveredPage.getByRole('button',{name:'Review backup'}).click();
  await recoveredPage.getByRole('button',{name:'Restore missing data'}).click();
  await recoveredPage.getByText(/Restore verified by local readback/).waitFor();
  await recoveredPage.getByRole('button',{name:'Restore missing data'}).click();
  await recoveredPage.getByText(/Restore verified by local readback/).waitFor();
  const recoveredState=await recoveredPage.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('pretend-internet-nostr',3);request.onsuccess=()=>resolve(request.result);request.onerror=reject;});
    const rows=await Promise.all(['books','events','files','receipts','connections'].map(name=>new Promise(resolve=>{const req=db.transaction(name).objectStore(name).getAll();req.onsuccess=()=>resolve(req.result);})));db.close();
    return {counts:rows.map(row=>row.length),recovered:rows[3].every(row=>row.recovered),signer:localStorage.getItem('pretend-nostr:publishing-account'),bookmarks:localStorage.getItem('pretend-nostr:bookmarks')};
  });
  assert.ok(recoveredState.counts.slice(0,4).every(count=>count>0));
  assert.equal(recoveredState.counts[4],0);
  assert.equal(recoveredState.signer,null);
  assert.equal(recoveredState.recovered,true);
  assert.ok(recoveredState.bookmarks);
  await recoveredContext.close();
  await open('profile.html');
  await button('Sign out').click();
  await button('Sign in with browser signer').waitFor();
  await open('index.html');
  await button('Open profile menu').click();
  await page.getByRole('dialog').getByRole('link',{name:'Sign in',exact:true}).waitFor();
  assert.deepEqual(uncaught,[]);
  console.log('Mobile Chromium passed profiles, metadata-only discovery, game handoff, music playback, long-form writing, reader swipe and offline resume, Markdown curation, and disposable nsite signing and verification.');
  console.log('Review regressions passed: failed replacement stays blocked, relay readback authenticates, and music navigation survives a refresh.');
  console.log('Nsite lifecycle passed npub lookup, Markdown autofill, owned multi-file creation, same-address update and restore.');
  console.log('The authorized remote signer session survived reload and signed as the same account.');
  if (packaged) console.log('Packaged Amber callback passed profile-first sign-in, sign-in persistence, stale callback rejection, cancellation, exact signature verification, and relay authentication with no clipboard fields.');
} catch (error) {
  console.error('Last route:', new URL(page.url()).pathname, 'Browser errors:', uncaught, 'Visible status:', await page.locator('main [role=status]:not([hidden])').allTextContents());
  throw error;
} finally {
  await browser.close();
  server.close();
}
