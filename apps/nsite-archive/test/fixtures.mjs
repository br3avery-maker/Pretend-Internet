import {sha,hex,schnorr,parseManifest,fileRoot} from '../vendor/archive-engine.js';
export function signed({kind=35128,identifier='stars',files={'/index.html':'<title>Quiet observatory</title><h1>Jupiter watch</h1><p>The observatory tracks Jupiter and moonlight.</p>'},created=1700000000,author=1,title='',description=''}={}){
 const secret=new Uint8Array(32);secret[31]=author;
 const event={kind,pubkey:hex(schnorr.getPublicKey(secret)),created_at:created,tags:[...(kind===35128?[['d',identifier]]:[]),...Object.entries(files).map(([path,text])=>kind===34128?['d',path]:['path',path,sha(text)]),...(kind===34128?[['x',sha(Object.values(files)[0])]]:[]),...(title?[['title',title]]:[]),...(description?[['description',description]]:[])],content:''};
 event.id=sha(JSON.stringify([0,event.pubkey,event.created_at,event.kind,event.tags,event.content]));event.sig=hex(schnorr.sign(Uint8Array.from(Buffer.from(event.id,'hex')),secret));return {event,files};
}
export function fixtureBundle(){
 const fixtures=[signed(),signed({created:1700000010,files:{'/index.html':'<title>Quiet observatory</title><h1>Jupiter watch</h1><p>The observatory tracks Jupiter and Saturn.</p>','/notes.txt':'The telescope resolves the rings of Saturn.'}}),signed({author:2,identifier:'serial',title:'Serial work | 106',files:{'/index.html':'<h1>A legitimate serial publication</h1><p>Many editions are welcome.</p>'}}),...['Independent web researcher','Practical technology researcher','Community writer sharing','Online publishing specialist','Digital resources editor'].map((description,i)=>signed({identifier:'campaign'+i,title:'Excluded campaign '+i,description:description+' promoting the confirmed campaign.'})),signed({identifier:'body-campaign',files:{'/index.html':'<meta name="description" content="Independent web researcher promoting the confirmed campaign."><h1>Page-only campaign</h1>'}})];
 const stores=Object.fromEntries(['events','versions','jobs','objects','blobs','pages','scans','settings','sources','staging','index-failures','blob-sources','staging-parts'].map(k=>[k,[]]));
 const objects=new Map(),blobs=new Map();
 for(const {event,files} of fixtures){
  const v=parseManifest(event);stores.events.push({id:event.id,event});stores.versions.push({id:event.id,...v,coverage:'manifest'});stores.sources.push({id:event.id+'\nfixture',event:event.id,source:'deterministic-fixture'});
  for(const [path,text] of Object.entries(files)){const bytes=new TextEncoder().encode(text),hash=sha(bytes);objects.set(hash,bytes);const parts=[{hash,size:bytes.length}],root=fileRoot(parts,(h,b)=>objects.set(h,Uint8Array.from(b)));blobs.set(hash,{id:hash,size:bytes.length,parts,root});}
 }
 stores.objects=[...objects].map(([id,data])=>({id,data:Buffer.from(data).toString('base64')}));stores.blobs=[...blobs.values()];stores.jobs=stores.blobs.map(b=>({id:b.id,state:'complete',origins:[],attempts:0,error:null}));
 return {format:'pretend-internet.browser-archive.v1',created:'2026-10-31T00:00:00Z',stores};
}
