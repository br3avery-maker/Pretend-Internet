import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { RelayRouter,Registry,classifyKind,normalizeURL } from '../router.mjs';
import { signedEvent } from '../validation.mjs';
import { RelayTransport } from '../transport.mjs';
import { serve } from './relay-server.mjs';
const clock=()=>1800000000;
const key=new Uint8Array(32).fill(1),other=new Uint8Array(32).fill(2);
const pubkey=getPublicKey(key),otherPub=getPublicKey(other);
const event=(kind=45678,tags=[],content='',sk=key,time=clock())=>finalizeEvent({kind,tags,content,created_at:time},sk);
function router(urls=[],extra={}) {return new RelayRouter({bootstrap:urls,registry:new Registry({clock}),clock,...extra});}
const readless={query:async()=>({events:[],status:'complete'})};
const noInfo=async()=>{throw Error('offline');};

test('all 65536 event kinds are recognized without a workload whitelist',()=>{
  const counts={};for(let kind=0;kind<=65535;kind++){const c=classifyKind(kind);counts[c]=(counts[c]??0)+1;}
  assert.equal(Object.values(counts).reduce((a,b)=>a+b),65536);
  assert.equal(classifyKind(65535),'unspecified');assert.equal(classifyKind(21000),'ephemeral');
  for(const kind of [-1,65536,1.1,NaN,'1'])assert.throws(()=>classifyKind(kind));
});
test('unknown future kinds route and event validation ignores spoofed verifier cache',()=>{
  const r=router(['wss://general.example']);assert.equal(r.plan(event(),{redundancy:1}).groups[0].selected.length,1);
  const e=event();e.content='mutated';assert.throws(()=>signedEvent(e),/signature/);
  assert.throws(()=>r.plan(event(22242)),/transport-auth/);
  assert.throws(()=>r.plan(event(1,[['-']])),/author-auth/);
});
test('canonical URLs, credential URLs and discovered local/insecure addresses',()=>{
  assert.equal(normalizeURL('wss://EXAMPLE.com:443/'),'wss://example.com');
  for(const u of ['wss://user:pass@example.com','wss://example.com?token=private','wss://example.com#secret',
    'ws://example.com','wss://127.0.0.1','wss://10.0.0.1','wss://[::1]','wss://host.local'])assert.throws(()=>normalizeURL(u));
});
test('fresh direct frame/content/tag/PoW limits are event-specific; Unicode uses characters',()=>{
  const r=router(['wss://a.example','wss://b.example']);
  r.registry.info('wss://a.example',{limitation:{max_content_length:2,max_event_tags:1,max_message_length:10000}});
  assert.equal(r.plan(event(1,[],'🖤💗'),{redundancy:1}).excluded.length,0);
  assert.ok(r.plan(event(1,[],'abc')).excluded.some(x=>x.reasons.includes('content-size')));
  r.registry.info('wss://a.example',{limitation:{max_message_length:1}});
  assert.ok(r.plan(event()).excluded.some(x=>x.reasons.includes('frame-size')));
  r.registry.info('wss://a.example',{limitation:{min_pow_difficulty:256}});
  assert.ok(r.plan(event()).excluded.some(x=>x.reasons.includes('pow')));
});
test('NIP-11 auth/payment and restricted-write conditions remain distinct',()=>{
  const r=router(['wss://a.example','wss://b.example','wss://c.example']);
  r.registry.info('wss://a.example',{limitation:{auth_required:true}});
  r.registry.info('wss://b.example',{limitation:{payment_required:true}});
  r.registry.info('wss://c.example',{limitation:{restricted_writes:true}});
  const p=r.plan(event());assert.deepEqual(p.excluded.map(x=>x.reasons[0]),['auth-required','payment-required']);
  assert.ok(p.groups[0].selected[0].warnings.includes('restricted-write-policy-unverified'));
  assert.equal(r.plan(event(),{signAuth:()=>{},authPubkey:pubkey,entitledRelays:['wss://b.example']}).excluded.length,0);
});
test('signed monitor kind hints change routing per kind without a global best relay',()=>{
  const r=router(['wss://a.example','wss://b.example']);
  r.registry.monitor(event(30166,[['d','wss://a.example'],['k','1']]));
  r.registry.monitor(event(30166,[['d','wss://b.example'],['k','30023']]));
  assert.equal(r.plan(event(1),{redundancy:1}).groups[0].selected[0].url,'wss://a.example');
  assert.equal(r.plan(event(30023),{redundancy:1}).groups[0].selected[0].url,'wss://b.example');
  assert.equal(r.plan(event(56789)).groups[0].selected.length,2);
});
test('malicious, stale, conflicting or absent monitor reports never erase viable relays',()=>{
  const r=router(['wss://a.example']);
  r.registry.monitor(event(30166,[['d','wss://a.example'],['k','!1']]));
  r.registry.monitor(event(30166,[['d','wss://a.example'],['k','1']], '',other));
  let p=r.plan(event(1));assert.equal(p.excluded.length,0);assert.ok(p.groups[0].selected[0].warnings.includes('monitor-conflict'));
  assert.equal(r.registry.monitor(event(30166,[['d','wss://a.example']], '',key,clock()-4000)),false);
  assert.equal(r.registry.monitor(event(30166,[['d','wss://a.example']], '',key,clock()+120)),false);
  const tampered=event(30166,[['d','wss://a.example']]);tampered.tags[0][1]='wss://evil.example';
  assert.equal(r.registry.monitor(tampered),false);
  assert.equal(router(['wss://a.example']).plan(event(1)).groups[0].selected.length,1);
});
test('author write relays and recipient read relays have separate delivery groups',()=>{
  const r=router(['wss://default.example']);
  r.ingestList(event(10002,[['r','wss://write.example','write'],['r','wss://read-only.example','read']]));
  r.ingestList(event(10002,[['r','wss://recipient.example']], '',other));
  const groups=r.plan(event(1,[['p',otherPub]]),{redundancy:1}).groups;
  assert.equal(groups[0].selected[0].url,'wss://write.example');
  assert.equal(groups[1].selected[0].url,'wss://recipient.example');
  assert.ok(!groups[0].selected.concat(groups[0].fallbacks).some(x=>x.url==='wss://read-only.example'));
});
test('private and giftwrapped events cannot use public fallback or leak metadata queries',async()=>{
  let queries=0;const r=router(['wss://public.example'],{transport:{query:async()=>{queries++;return {events:[]};}},fetch:noInfo});
  assert.throws(()=>r.plan(event(),{visibility:'private'}),/private-destinations/);
  const p=await r.discover(event(),{visibility:'private',allowedRelays:['wss://private.example'],redundancy:1});
  assert.equal(queries,0);assert.equal(p.groups[0].selected[0].url,'wss://private.example');
  assert.throws(()=>r.plan(event(1059,[['p',otherPub]])),/recipient/);
  const inbox=event(10050,[['relay','wss://inbox.example']], '',other);
  const p2=await r.discover(event(1059,[['p',otherPub]]),{recipientLists:[inbox],redundancy:1});
  assert.equal(queries,0);assert.equal(p2.groups[0].selected[0].url,'wss://inbox.example');
});
test('rejection cooldown is scoped to exact event and authenticated principal',()=>{
  const r=router(['wss://a.example']);const e=event();
  r.registry.observe('wss://a.example',e,{code:'restricted',accepted:false});
  assert.ok(r.plan(e).excluded.some(x=>x.reasons.includes('recent-restricted')));
  assert.equal(r.plan(event(45678,[],'different')).excluded.length,0);
  assert.equal(r.plan(e,{authPubkey:pubkey}).excluded.length,0);
});
test('local registry roundtrip retains sanitized evidence but not event content/rejection secrets',()=>{
  const r=router(['wss://a.example']);const e=event(56789,[],'private content');
  r.registry.info('wss://a.example',{limitation:{max_content_length:123},secret:'NOPE'});
  r.registry.observe('wss://a.example',e,{accepted:false,code:'restricted',reason:'secret token'});
  const json=JSON.stringify(r.registry.snapshot());assert.ok(!json.includes('private content'));assert.ok(!json.includes('secret'));
  const restored=new Registry({clock}).restore(JSON.parse(json));assert.equal(restored.relays.size,1);
  assert.equal(restored.relays.get('wss://a.example').observations[0].code,'restricted');
});
test('readback failure never becomes verified; fallback publishes same event without resigning',async t=>{
  const bad=await serve({reject:()=> 'unsupported-kind: this relay refuses the kind'});
  const good=await serve();t.after(()=>bad.close());t.after(()=>good.close());
  const r=new RelayRouter({bootstrap:[bad.url,good.url],pinned:[bad.url],registry:new Registry({allowLocal:true}),transport:new RelayTransport({timeout:500})});
  const e=event(56789,[],'fixture content excluded from receipt');const receipt=await r.publish(e,{redundancy:1});
  assert.equal(receipt.status,'verified');assert.equal(receipt.attempts[0].code,'unsupported-kind');
  assert.equal(bad.published[0].id,e.id);assert.equal(good.published[0].sig,e.sig);
  assert.ok(!JSON.stringify(receipt).includes(e.content||'UNLIKELY'));
});
test('durable acceptance with corrupt/missing readback remains partial',async t=>{
  const server=await serve({corruptReadback:true});t.after(()=>server.close());
  const r=new RelayRouter({bootstrap:[server.url],registry:new Registry({allowLocal:true}),transport:new RelayTransport({timeout:300})});
  const receipt=await r.publish(event(1),{redundancy:1});
  assert.equal(receipt.status,'partial-or-failed');assert.equal(receipt.attempts[0].accepted,true);assert.equal(receipt.attempts[0].verified,false);
});
test('ephemeral events require acceptance, not an impossible stored-event readback',async t=>{
  const server=await serve({store:false});t.after(()=>server.close());
  const r=new RelayRouter({bootstrap:[server.url],registry:new Registry({allowLocal:true}),transport:new RelayTransport({timeout:300})});
  const receipt=await r.publish(event(25001),{redundancy:1});
  assert.equal(receipt.status,'accepted-ephemeral');assert.equal(receipt.attempts[0].verified,false);
  assert.equal(receipt.attempts[0].readback,'not-expected');
});
test('NIP-42 external signer completes challenge-bound AUTH and retries only same event',async t=>{
  const server=await serve({auth:true});t.after(()=>server.close());
  const r=new RelayRouter({bootstrap:[server.url],registry:new Registry({allowLocal:true}),transport:new RelayTransport({timeout:500})});
  const e=event(56789);let calls=0;
  const receipt=await r.publish(e,{redundancy:1,authPubkey:pubkey,signAuth:async template=>{calls++;return finalizeEvent(template,key);}});
  assert.equal(receipt.status,'verified');assert.equal(calls,1);
  assert.ok(server.authEvents[0].tags.some(t=>t[0]==='relay'&&t[1]===server.url));
  assert.equal(server.published.length,2);assert.equal(server.published[0].sig,server.published[1].sig);
});
test('signer refusal/mutated AUTH is bounded, redacted, and cannot report success',async t=>{
  const server=await serve({auth:true});t.after(()=>server.close());
  const r=new RelayRouter({bootstrap:[server.url],registry:new Registry({allowLocal:true}),transport:new RelayTransport({timeout:200})});
  const receipt=await r.publish(event(),{redundancy:1,authPubkey:pubkey,signAuth:async template=>finalizeEvent({...template,content:'tampered'},key)});
  assert.equal(receipt.status,'partial-or-failed');assert.equal(receipt.attempts[0].code,'auth-mismatch');assert.equal(server.authEvents.length,0);
});
test('real signed NIP-66 discovery finds a new relay and directly inspects before publication',async t=>{
  const destination=await serve();t.after(()=>destination.close());
  const report=event(30166,[['d',destination.url],['k','56789']], '',other,Math.floor(Date.now()/1000));
  const seed=await serve({metadata:[report],info:{limitation:{max_message_length:1}}});t.after(()=>seed.close());
  const r=new RelayRouter({bootstrap:[seed.url],registry:new Registry({allowLocal:true}),transport:new RelayTransport({timeout:500})});
  const receipt=await r.publish(event(56789),{redundancy:1});
  assert.equal(receipt.status,'verified');assert.equal(destination.published.length,1);assert.equal(seed.published.length,0);
  assert.ok(destination.requests.some(x=>x.headers.accept==='application/nostr+json'));
});
test('Blossom preflight classifies status without parsing X-Reason or uploading bytes',async t=>{
  const a=await serve({preflight:415});const b=await serve({preflight:200});t.after(()=>a.close());t.after(()=>b.close());
  const r=new RelayRouter({bootstrap:[],registry:new Registry({allowLocal:true})});
  const result=await r.preflightBlob({sha256:'a'.repeat(64),size:123,type:'application/custom'},{servers:[a.http,b.http]});
  assert.equal(result.decisions[0].code,'media-type');assert.deepEqual(result.selected,[b.http]);assert.equal(result.decisions[1].verified,false);
  assert.ok(a.requests.every(x=>x.method==='HEAD'));assert.equal(b.requests[0].headers['x-content-length'],'123');
});
test('network deadlines stop a silent subscription',async t=>{
  const server=await serve({slow:true});t.after(()=>server.close());const start=Date.now();
  await assert.rejects(new RelayTransport({timeout:100}).query(server.url,{kinds:[1]},1));
  assert.ok(Date.now()-start<1000);
});
test('pathful relay URLs keep semantically significant trailing slashes and public IPv6',()=>{
  assert.equal(normalizeURL('wss://example.com/nostr/'),'wss://example.com/nostr/');
  assert.equal(normalizeURL('wss://[2001:4860:4860::8888]'),'wss://[2001:4860:4860::8888]');
});
test('authenticated readback works even when initial publication did not need AUTH',async t=>{
  const server=await serve({authRead:true});t.after(()=>server.close());
  const r=new RelayRouter({bootstrap:[server.url],registry:new Registry({allowLocal:true}),transport:new RelayTransport({timeout:300})});
  const receipt=await r.publish(event(),{redundancy:1,authPubkey:pubkey,signAuth:async e=>finalizeEvent(e,key)});
  assert.equal(receipt.status,'verified');assert.equal(server.published.length,1);assert.equal(server.authEvents.length,1);
});
test('truthy malformed OK cannot masquerade as acceptance',async t=>{
  const server=await serve({malformedOK:true});t.after(()=>server.close());
  const r=new RelayRouter({bootstrap:[server.url],registry:new Registry({allowLocal:true}),transport:new RelayTransport({timeout:100})});
  const receipt=await r.publish(event(),{redundancy:1});
  assert.equal(receipt.status,'partial-or-failed');assert.equal(receipt.attempts[0].accepted,false);
});
test('a missing recipient list cannot be masked by a successful author delivery',async t=>{
  const server=await serve();t.after(()=>server.close());
  const r=new RelayRouter({bootstrap:[server.url],registry:new Registry({allowLocal:true})});
  const receipt=await r.publish(event(1,[['p',otherPub]]),{redundancy:1});
  assert.equal(receipt.groups[0].status,'verified');assert.equal(receipt.groups[1].status,'not-delivered');
  assert.equal(receipt.status,'partial-or-failed');
});
test('invalid identity and delivery options cannot leak credentials into registry state',()=>{
  const r=router(['wss://a.example']);
  for(const options of [{authPubkey:'nsec1-do-not-store'},{signAuth:'bunker://secret'},{maxAttempts:-1},{recipientLists:{}}])
    assert.throws(()=>r.plan(event(),options));
  assert.throws(()=>r.registry.observe('wss://a.example',event(),{code:'rejected'},'private-token'));
  assert.ok(!JSON.stringify(r.registry.snapshot()).includes('private-token'));
});
test('explicit kind refusal prevents repeated same-kind publication while other kinds stay viable',()=>{
  const r=router(['wss://a.example','wss://b.example']);const e=event(56789);
  r.registry.observe('wss://a.example',e,{code:'unsupported-kind',accepted:false});
  assert.ok(r.plan(event(56789,[],'new content')).excluded.some(x=>x.reasons.includes('observed-unsupported-kind')));
  assert.equal(r.plan(event(56788)).excluded.length,0);
});
test('recipient limits fail explicitly instead of silently dropping delivery groups',()=>{
  const tags=Array.from({length:17},(_,i)=>['p',i.toString(16).padStart(64,'0')]);
  assert.throws(()=>router().plan(event(1,tags)),/recipient-limit/);
});
test('an asynchronous or denied destination policy fails closed before network access',async()=>{
  let accessed=false;const r=router(['wss://a.example'],{allowDestination:async()=>true,fetch:async()=>{accessed=true;}});
  const plan=await r.discover(event(),{redundancy:1});assert.equal(accessed,false);assert.equal(plan.groups[0].selected.length,0);
});
