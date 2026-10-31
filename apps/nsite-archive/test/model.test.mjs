import test from 'node:test';import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
import {buildCatalog,listCatalog,materialize,diffFiles} from '../model.js';
import {parseManifest,campaignPrefix,verifyEvent} from '../vendor/archive-engine.js';
import {signed,fixtureBundle} from './fixtures.mjs';
test('signed publications reject altered signatures',()=>{const {event}=signed();assert.equal(verifyEvent(event).id,event.id);assert.throws(()=>verifyEvent({...event,content:'tampered'}));});
test('confirmed signatures exclude all ordinary lists, searches and publisher counts',()=>{
 const b=fixtureBundle(),records=b.stores.versions;
 const body=records.find(r=>r.site.endsWith(':body-campaign'));
 const pages=[{hash:body.files[0].hash,path:'/index.html',data:{description:'Independent web researcher promoting the confirmed campaign.'}}];
 const c=buildCatalog(records,pages,b.stores.jobs,[]),list=listCatalog(c);
 assert.equal(list.excluded,6);assert.equal(list.total,2);assert.equal(list.publishers.length,2);
 assert.equal(listCatalog(c,{query:'Excluded campaign'}).total,0);assert.equal(listCatalog(c,{hidden:true}).total,2);
 assert(list.rows.some(s=>s.title==='Serial work | 106'));
});
test('matching respects word boundaries; volume and pipes are not classifiers',()=>{assert.equal(campaignPrefix('Independent web researchership'),null);assert.equal(campaignPrefix('Serial work | 106'),null);});
test('legacy history preserves same-second ordering without reconstructing every snapshot',()=>{
 const a=parseManifest(signed({kind:34128,files:{'/a.txt':'old'},created:1}).event),b=parseManifest(signed({kind:34128,files:{'/b.txt':'second'},created:1}).event);
 const records=[{...a,id:'b'},{...b,id:'a'}];const old=materialize(records,'b'),latest=materialize(records,'a');assert.equal(old.files.length,1);assert.equal(latest.files.length,2);
});
test('page text search and publisher query work without supplied title',()=>{
 const b=fixtureBundle(),v=b.stores.versions[1];const c=buildCatalog(b.stores.versions,[{hash:v.files[0].hash,path:'/index.html',data:{title:'Quiet observatory',text:'Jupiter and Saturn'}}],b.stores.jobs,[]);
 assert.equal(listCatalog(c,{query:'Saturn'}).total,1);assert.equal(listCatalog(c,{query:v.event.pubkey,publisher:v.event.pubkey}).total,2);
});
test('diff reports native path changes and reused content chunks',()=>{
 const a={files:[{path:'/a',hash:'old'},{path:'/gone',hash:'gone'}]},b={files:[{path:'/a',hash:'new'},{path:'/added',hash:'add'}]};
 const blobs=new Map([['old',{parts:[{hash:'shared',size:10}]}],['new',{parts:[{hash:'shared',size:10},{hash:'different',size:2}]}]]);
 assert.deepEqual(diffFiles(a,b,blobs).map(c=>[c.path,c.status,c.reusedBytes]),[['/a','changed',10],['/added','added',null],['/gone','removed',null]]);
});
test('10,000 legacy updates have bounded listing output and linear snapshot materialization',()=>{
 const base=parseManifest(signed({kind:34128,files:{'/seed.txt':'seed'}}).event);
 const records=Array.from({length:10000},(_,i)=>({...base,id:String(i).padStart(8,'0'),event:{...base.event,created_at:i},files:[{path:'/file'+i+'.txt',hash:base.files[0].hash}]}));
 const started=performance.now(),c=buildCatalog(records,[],[],[]),list=listCatalog(c);const elapsed=performance.now()-started;
 assert.equal(list.rows.length,1);assert.equal(list.rows[0].files,10000);assert(elapsed<3000,`10k legacy catalog took ${elapsed}ms`);console.log(`10,000 legacy updates: ${elapsed.toFixed(1)}ms`);
});

test('restoration ZIP preserves prototype names, Unicode and exact bytes',async()=>{
 const {zip}=await import('../vendor/archive-engine.js');const {inflateRawSync}=await import('node:zlib');
 const expected=new Map(['__proto__','constructor','toString','folder/__proto__','日本語.txt'].map(name=>[name,new TextEncoder().encode('bytes for '+name)]));
 const input=Object.create(null);for(const [name,bytes] of expected)input[name]=bytes;
 const data=zip(input),view=new DataView(data.buffer,data.byteOffset,data.byteLength),count=view.getUint16(data.length-12,true);let offset=view.getUint32(data.length-6,true);
 assert.equal(count,expected.size);
 for(let i=0;i<count;i++){
  assert.equal(view.getUint32(offset,true),0x02014b50);const length=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),size=view.getUint32(offset+20,true),local=view.getUint32(offset+42,true),method=view.getUint16(offset+10,true);
  const name=new TextDecoder().decode(data.subarray(offset+46,offset+46+length)),start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),compressed=data.subarray(start,start+size),bytes=method===0?compressed:inflateRawSync(compressed);
  assert(expected.has(name),`Unexpected entry ${name}`);assert.deepEqual(Uint8Array.from(bytes),expected.get(name));expected.delete(name);offset+=46+length+extra+comment;
 }
 assert.equal(expected.size,0);
});
