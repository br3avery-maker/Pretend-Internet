import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { advanceCoverage, publicationRouter } from '../src/lib/nostr.js';
import { fitsEventCache, eventCacheLimits } from '../src/lib/store.js';
import { publicMutes, visibility } from '../src/lib/moderation.js';
import { groupSites, safePath, siteURL } from '../src/lib/model.js';
import { chaptersFromMarkdown } from '../src/lib/text.js';
import { execute, publicationHistory, siteFiles, uploadVerified } from '../src/lib/publisher.js';

const author = 'a'.repeat(64);
const event = (id, timestamp, title, slug = 'game') => ({
  id, kind: 35128, pubkey: author, created_at: timestamp, tags: [['d', slug], ['title', title], ['description', 'An arcade game'], ['path', '/index.html', 'f'.repeat(64)]],
});

test('groups revisions by author and slug using only signed-event metadata fields', () => {
  const result = groupSites([event('old', 1, 'Old'), event('latest', 2, 'Latest'), event('different', 1, 'Another', 'other')]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].versions.map(item => item.id), ['latest', 'old']);
  assert.equal(result[0].title, 'Latest');
  assert.equal(result[0].category, 'Game');
  assert.equal(result[0].files, 1);
  assert.match(siteURL(author, 'game'), /^https:\/\/[a-z0-9]+game\.nsite\.lol\/$/);
  assert.equal(siteURL(author, 'bad-'), '');
});

test('normalizes HTML and folder ZIP for review, hashes each file and rejects unsafe paths', async () => {
  const html = new File(['<h1>Test</h1>'], 'test.html');
  const [single] = await siteFiles([html]);
  assert.equal(single.path, '/index.html');
  assert.match(single.hash, /^[0-9a-f]{64}$/);
  const archive = new File([zipSync({ 'test/index.html': strToU8('<h1>Test</h1>'), 'test/style.css': strToU8('body{}') })], 'test.zip');
  assert.deepEqual((await siteFiles([archive])).map(file => file.path), ['/index.html', '/style.css']);
  assert.deepEqual((await siteFiles([archive], { partial: true })).map(file => file.path), ['/test/index.html', '/test/style.css']);
  const invalid = new File([zipSync({ 'index.html': strToU8('text'), '../bad.html': strToU8('bad') })], 'invalid.zip');
  await assert.rejects(siteFiles([invalid]), /invalid path/);
  assert.throws(() => safePath('/folder/%2e%2e/index.html'));
});

test('reuses the identical reviewed event and uploads on retry, and checks independent readback', async () => {
  const secret = generateSecretKey();
  let signs = 0;
  let uploads = 0;
  let available = false;
  const signer = { pubkey: getPublicKey(secret), sign: async value => { signs++; return finalizeEvent(value, secret); } };
  const draft = { type: 'nsite', title: 'Test', slug: 'test', body: '', server: 'https://blossom.fixture.example', relays: ['wss://relay.fixture.example'] };
  draft.site = { owner: signer.pubkey, mode: 'create', root: false, slug: 'test', servers: [], readRelays: ['wss://read.fixture.example'] };
  const files = await siteFiles([new File(['<h1>Test</h1>'], 'index.html')]);
  let sent;
  const options = {
    draft, files, signer, checkpoint: async () => {}, verifyFiles: async () => {},
    upload: async () => { uploads++; return 'https://blossom.fixture.example/file'; },
    transport: {
      async query() { return { status: 'complete', events: available && sent ? [sent] : [] }; },
      async publish(_url, value) { sent = value; return { accepted: true, verified: available, code: 'accepted' }; },
    },
  };
  const initial = await execute(options);
  assert.equal(initial.status, 'accepted-unverified');
  available = true;
  const retried = await execute({ ...options, previous: initial });
  assert.equal(retried.event.id, initial.event.id);
  assert.equal(retried.status, 'verified');
  assert.equal(signs, 1);
  assert.equal(uploads, 1);
});

test('does not treat an upload descriptor as proof of the retrieved bytes', async () => {
  const [file] = await siteFiles([new File(['original'], 'index.html')]);
  const url = 'https://blossom.fixture.example/' + file.hash;
  const sign = async value => value;
  const response = async (requestURL, options) => {
    if (options.method === 'PUT') return Response.json({ url, sha256: file.hash });
    return new Response('corrupt!');
  };
  await assert.rejects(uploadVerified(file, 'https://blossom.fixture.example', sign, response), /differs/);
});

test('Markdown uses headings without dropping a preface or collapsing chapter identities', () => {
  const chapters = chaptersFromMarkdown('A preface.\n\n# First\n\nOne.\n\n## Second\n\nTwo.');
  assert.deepEqual(chapters.map(chapter => chapter.title), ['Start', 'First', 'Second']);
  assert.deepEqual(chapters.map(chapter => chapter.id), ['1', '2', '3']);
  assert.match(chapters[0].text, /preface/);
});


test('keeps the owner and address on partial update, refuses a collision or foreign signer, and restores a signed baseline', async () => {
  const key = generateSecretKey();
  const pubkey = getPublicKey(key);
  const signer = { pubkey, sign: async value => finalizeEvent(value, key) };
  const files = await siteFiles([new File([zipSync({ 'index.html': strToU8('original'), 'style.css': strToU8('body{}'), 'icon.svg': strToU8('<svg/>') })], 'site.zip')]);
  const server = 'https://blossom.fixture.example';
  const baseline = finalizeEvent({ kind: 35128, content: '', created_at: Math.floor(Date.now()/1000), tags: [
    ['d', 'test'], ['title', 'Original'], ['t', 'arcade'], ['server', server], ...files.map(file => ['path', file.path, file.hash]),
  ] }, key);
  let head = baseline;
  let writes = 0;
  let uploaded = 0;
  const site = { owner: pubkey, mode: 'update', root: false, slug: 'test', baseline, servers: [server], readRelays: ['wss://read.fixture.example'] };
  const draft = { type: 'nsite', title: 'Original', slug: 'test', body: '', server, relays: ['wss://relay.fixture.example'], site };
  const picked = await siteFiles([new File(['revised'], 'index.html')], { partial: true });
  const saved = [];
  const options = { draft, files: picked, signer, checkpoint: async () => {},
    upload: async () => { uploaded++; return server + '/' + picked[0].hash; }, verifyFiles: async paths => { saved.push(paths.map(file => file.path).sort()); },
    transport: { async query() { return { status: 'complete', events: [head] }; },
      async publish(_url, value) { writes++; head = value; return { accepted: true, code: 'accepted' }; } } };
  await assert.rejects(execute({ ...options, signer: { pubkey: author } }), /does not match/);
  await assert.rejects(execute({ ...options, draft: { ...draft, site: { ...site, mode: 'create' } } }), /already been published/);
  assert.equal(writes + uploaded, 0);
  const changed = await execute(options);
  assert.equal(changed.status, 'verified');
  assert.equal(changed.event.created_at, baseline.created_at + 1);
  assert.equal(changed.event.pubkey, pubkey);
  assert.ok(changed.event.tags.some(parts => parts[0] === 't' && parts[1] === 'arcade'));
  assert.deepEqual(saved[0], ['/icon.svg', '/style.css']);
  await assert.rejects(execute(options), /live site changed/);
  const restored = await execute({ ...options, files: [], backup: changed.baseline,
    draft: { ...draft, site: { ...site, mode: 'restore', baseline: changed.event, restore: baseline } } });
  assert.equal(restored.url, changed.url);
  assert.equal(restored.event.created_at, changed.event.created_at + 1);
  assert.deepEqual(restored.event.tags.filter(parts => parts[0] === 'path'), baseline.tags.filter(parts => parts[0] === 'path'));
  assert.equal(uploaded, 1);
  assert.equal(writes, 2);
});


test('completed article operations are immutable and A-B-A creates a newer signed event; incomplete retry reuses it', async () => {
  const secret = generateSecretKey();
  const signer = { pubkey: getPublicKey(secret), sign: async value => finalizeEvent(value, secret) };
  const receipts = new Map();
  let available = true;
  const draft = { type: 'article', title: 'Article', slug: 'article', body: 'A', relays: ['wss://relay.fixture.example'] };
  async function publish(body) {
    const reviewed = { ...draft, body };
    const history = await publicationHistory(signer.pubkey, reviewed, [], [...receipts.values()]);
    return execute({ draft: reviewed, files: [], signer, previous: history.previous, latestTimestamp: history.latestTimestamp, nextCreatedAt: history.nextCreatedAt,
      checkpoint: async row => receipts.set(row.id, structuredClone(row)),
      transport: { async publish() { return { accepted: true, verified: available, code: 'accepted' }; } } });
  }
  const a = await publish('A');
  const b = await publish('B');
  available = false;
  const revert = await publish('A');
  assert.notEqual(revert.id, a.id);
  assert.notEqual(revert.event.id, a.event.id);
  assert.ok(revert.event.created_at > b.event.created_at);
  assert.equal(revert.status, 'accepted-unverified');
  available = true;
  const retry = await publish('A');
  assert.equal(retry.id, revert.id);
  assert.equal(retry.event.id, revert.event.id);
  assert.equal(retry.status, 'verified');
  assert.equal(receipts.size, 3);
  assert.deepEqual(receipts.get(a.id), structuredClone(a));
  assert.deepEqual(receipts.get(b.id), structuredClone(b));
});


test('an interrupted upload can resume even after an older completed publication of that address', async () => {
  const draft = { type: 'track', slug: 'track', title: 'New', body: '', artist: 'Artist', relays: ['wss://relay.fixture.example'] };
  const fingerprint = await (await import('../src/lib/publisher.js')).jobId(author, draft, []);
  const old = { id: 'old', account: author, status: 'verified', createdAt: 10,
    event: { pubkey: author, kind: 36787, tags: [['d','track']], created_at: 1 } };
  const pending = { id: 'pending', fingerprint, account: author, status: 'uploading', createdAt: 20 };
  const history = await publicationHistory(author, draft, [], [old, pending]);
  assert.equal(history.previous.id, 'pending');
  assert.equal(history.latestTimestamp, 1);
});


test('signed public mute lists isolate owners, retain safe exceptions, and require the full campaign signature', () => {
  const key = generateSecretKey(), owner = getPublicKey(key);
  const other = generateSecretKey(), foreign = getPublicKey(other);
  const muted = 'b'.repeat(64);
  const signed = (secret, time, tags) => finalizeEvent({kind:10000, created_at:time, content:'', tags}, secret);
  const old = signed(key, 1, [['p',foreign]]);
  const current = signed(key, 2, [['p',muted], ['e','f'.repeat(64)], ['p','invalid']]);
  const unrelated = signed(other, 3, [['p',owner]]);
  const tampered = {...signed(key,4,[['p',foreign]]), content:'changed'};
  const mutes = publicMutes([old,current,unrelated,tampered],owner);
  assert.deepEqual([...mutes.publishers],[muted]);
  assert.equal(visibility({kind:36787,pubkey:muted,tags:[]},{mutes}), 'Public signed mute list');
  assert.equal(visibility({kind:36787,pubkey:muted,tags:[]},{mutes,safe:[muted]}),'');
  assert.equal(visibility({kind:36787,pubkey:muted,tags:[]},{mutes,safe:[muted],hidden:[muted]}),'Locally hidden publisher');
  const site = {kind:35128,pubkey:foreign,tags:[['d','campaign'],['description','Independent web researcher sharing curated resources at promo-example.com']]};
  assert.equal(visibility(site,{mutes}),'Confirmed campaign signature');
  assert.equal(visibility(site,{mutes,approved:[`35128:${foreign}:campaign`]}),'');
  assert.equal(visibility({...site,tags:[['description','Independent web researcher studying telescope optics.']]},{mutes}),'');
  assert.equal(visibility({kind:30023,pubkey:foreign,tags:[],id:'f'.repeat(64)},{mutes}),'Public signed mute list');
});


test('Blossom fallback is limited to reviewed destinations and never bypasses signer refusal', async () => {
  const key = generateSecretKey(), pubkey = getPublicKey(key);
  const primary = 'https://primary.fixture.example', fallback = 'https://fallback.fixture.example';
  const file = {path:'track.mp3',type:'audio/mpeg',hash:'a'.repeat(64),bytes:new Uint8Array([1])};
  const draft = {type:'track',title:'Track',slug:'track',artist:'Artist',body:'',server:primary,fallbackServers:[fallback],relays:['wss://relay.fixture.example']};
  const calls = [];
  const signer = {pubkey,sign:async value => finalizeEvent(value,key)};
  const transport = {async publish(){return {accepted:true,verified:true,code:'accepted'}}};
  const options = {draft,files:[file],signer,transport,checkpoint:async()=>{},
    upload:async (row,server,approve) => {
      calls.push(server);
      const auth = await approve({kind:24242,created_at:1,content:'',tags:[['server',new URL(server).host]]});
      assert.equal(auth.tags[0][1],new URL(server).host);
      if (server === primary) throw Error('Unavailable');
      return server + '/' + row.hash;
    }};
  const receipt = await execute(options);
  assert.deepEqual(calls,[primary,fallback]);
  assert.equal(receipt.uploadServers[file.hash],fallback);
  assert.equal(receipt.event.tags.find(row=>row[0]==='url')[1],fallback+'/'+file.hash);
  assert.equal(receipt.status,'verified');
  calls.length=0;
  await assert.rejects(execute({...options,signer:{pubkey,sign:async()=>{throw Error('Denied')}}}),/Denied/);
  assert.deepEqual(calls,[primary]);
  await assert.rejects(execute({...options,draft:{...draft,fallbackServers:['http://localhost']}}),/distinct public HTTPS/);
});


test('inclusive historical coverage does not skip a saturated timestamp or claim an incomplete relay is finished',()=>{
  const page={status:'limited',count:36,oldest:100};
  assert.deepEqual(advanceCoverage(undefined,page,36),{until:100});
  assert.deepEqual(advanceCoverage({until:100},page,36),{until:100,blocked:true});
  assert.deepEqual(advanceCoverage({until:100},{status:'timeout',count:0},36),{until:100});
  assert.deepEqual(advanceCoverage({until:100},{status:'complete',count:1,oldest:90},36),{done:true,until:90});
  assert.equal(fitsEventCache({count:eventCacheLimits.count,bytes:0},1),false);
  assert.equal(fitsEventCache({count:0,bytes:eventCacheLimits.bytes},1),false);
});
test('publication router inspects only reviewed relays and records incompatible policy',async()=>{
  const secret=generateSecretKey(),pubkey=getPublicKey(secret);
  const relay='wss://reviewed.fixture.example', other='wss://unreviewed.fixture.example';
  const seen=[];
  const transport={async query(url,filter){seen.push(url);return {events:[],status:'complete'};}};
  const fetcher=async url=>{seen.push(url);return new Response(JSON.stringify({limitation:{max_content_length:1}}));};
  const router=publicationRouter({relays:[relay]}, {pubkey}, transport,fetcher);
  const e=finalizeEvent({kind:1,content:'long',tags:[],created_at:1},secret);
  const plan=await router.plan(e,async template=>finalizeEvent(template,secret));
  assert.ok(plan.excluded.some(row=>row.url===relay&&row.reasons.includes('content-size')));
  assert.ok(seen.length>0 && seen.every(url=>url===relay || url==='https://reviewed.fixture.example/'));
  assert.ok(!seen.includes(other));
});
