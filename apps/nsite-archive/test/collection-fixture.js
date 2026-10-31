// Deterministic local collection transport for UI regression tests only.
import {openArchive,importEvent,sha,hex,schnorr} from '../vendor/archive-engine.js';
self.onmessage=async({data})=>{if(data.type!=='collect')return;const db=await openArchive();try{
 const secret=new Uint8Array(32);secret[31]=1;const identifier=Date.now().toString(36);
 const event={kind:35128,pubkey:hex(schnorr.getPublicKey(secret)),created_at:Math.floor(Date.now()/1000),tags:[['d',identifier],['title',data.options.testTitle],['path','/index.html',sha('pending test bytes')]],content:''};
 event.id=sha(JSON.stringify([0,event.pubkey,event.created_at,event.kind,event.tags,event.content]));event.sig=hex(schnorr.sign(Uint8Array.from(event.id.match(/../g),h=>parseInt(h,16)),secret));
 await importEvent(db,event,'local-collection-regression');self.postMessage({type:'done',discovery:{events:1},paused:false});
}catch(error){self.postMessage({type:'error',message:error.message});}finally{db.close();}};
