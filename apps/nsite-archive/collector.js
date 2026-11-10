import * as archive from './vendor/archive-engine.js';
import {discover,appendPartial,readPartial,clearPartial,storeVerifiedBlob,queryRelay} from './vendor/collector-engine.js';
import {indexArchive} from './indexer.js';
import {buildCatalog} from './model.js';
export const CONTROL='collection-control';
export async function updateControl(db,change){const tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings'),old=await store.get(CONTROL)||{id:CONTROL,running:false};const value=typeof change==='function'?change(old):{...old,...change};await store.put({...value,id:CONTROL});await tx.done;return value;}

export function readableError(code){return ({'http-404':'File is missing from this server (404).','hash-mismatch':'Downloaded bytes failed verification; another source will be tried.','network-timeout':'Server did not respond in time.','no-server-hints':'No download server is known yet.','Failed to fetch':'The server is unreachable or blocked by browser networking rules.','byte-budget':'File exceeds the selected transfer limit.'})[code]||code;}
const lock=fn=>globalThis.navigator?.locks?navigator.locks.request('nsite-archive-writer',fn):fn();
export async function transfer(db,job,{servers=[],proxy='',maxBlobBytes=33554432,maxTransferBytes=Infinity,signal,onProgress=()=>{},fetcher=fetch}={}){
 let error='no-server-hints',bytes=0;
 for(const server of [...new Set([...job.origins,...servers])]){
  if(signal?.aborted)throw new DOMException('Paused','AbortError');
  let url;try{url=new URL('/'+job.id,server);if(!['https:','http:'].includes(url.protocol))throw Error('Invalid download server URL.');}catch(e){error=e.message;continue;}
  const abort=new AbortController(),cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});let timer;
  const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>abort.abort(),15000);};reset();
  let reader;const deadline=setTimeout(()=>abort.abort(),45000);
  try{
   const staging=await db.get('staging',job.id),offset=staging?.size??staging?.data?.length??0;
   const init={signal:abort.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',headers:offset?{Range:`bytes=${offset}-`}:{}};
   let response;try{response=await fetcher(url.href,init);}catch(e){if(!proxy||abort.signal.aborted||e.name!=='TypeError')throw e;const via=new URL(proxy);if(!['https:','http:'].includes(via.protocol))throw Error('Invalid proxy URL.');via.searchParams.set('url',url.href);response=await fetcher(via.href,init);}
   if(response.status===416&&offset){const data=await readPartial(db,job.id);if(archive.sha(data)!==job.id){await clearPartial(db,job.id);throw Error('Saved partial file could not be resumed; retrying from the beginning.');}await storeVerifiedBlob(db,job.id,data,{server:url.origin});await clearPartial(db,job.id);return {bytes,complete:true};}
   if(!response.ok)throw Error('http-'+response.status);
   let loaded=response.status===206?offset:0;
   if(response.status===206){const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');if(!range||Number(range[1])!==offset||Number(range[3])>maxBlobBytes)throw Error('Invalid or unavailable resume range.');}
   else if(offset)await clearPartial(db,job.id);
   const length=Number(response.headers.get('content-length')),total=length>0?loaded+length:null;
   if(total>maxBlobBytes)throw Error('byte-budget');
   onProgress({phase:'download',hash:job.id,path:job.path,site:job.site,server:url.origin,loaded,total,bytes});
   if(!response.body)throw Error('Server returned no file body.');reader=response.body.getReader();
   while(true){reset();const part=await reader.read();if(part.done)break;if(signal?.aborted)throw new DOMException('Paused','AbortError');loaded+=part.value.length;bytes+=part.value.length;if(bytes>maxTransferBytes)throw Error('Selected transfer budget reached.');if(loaded>maxBlobBytes)throw Error('byte-budget');await appendPartial(db,job.id,part.value);onProgress({phase:'download',hash:job.id,path:job.path,site:job.site,server:url.origin,loaded,total,bytes});}
   const data=await readPartial(db,job.id);if(archive.sha(data)!==job.id){await clearPartial(db,job.id);throw Error('hash-mismatch');}
   onProgress({phase:'verify',hash:job.id,path:job.path,loaded:data.length,total:data.length,bytes});
   await storeVerifiedBlob(db,job.id,data,{server:url.origin,proxy:proxy||null});await clearPartial(db,job.id);return {bytes,complete:true};
  }catch(e){if(e.name==='QuotaExceededError')throw e;if(signal?.aborted)throw e;error=e.name==='AbortError'?'network-timeout':e.message;}
  finally{clearTimeout(timer);clearTimeout(deadline);signal?.removeEventListener('abort',cancel);try{await reader?.cancel();}catch{}}
 }
 const current=await db.get('jobs',job.id);const attempts=(current?.attempts||0)+1;
 await db.put('jobs',{...current,state:'pending',attempts,error,nextRetry:Date.now()+Math.min(300000,10000*2**Math.min(attempts,5))});
 onProgress({phase:'failure',path:job.path,hash:job.id,site:job.site,error:readableError(error)});return {bytes,complete:false};
}
export async function runQueue({signal,onProgress=()=>{},maxDuration=85000}={}){
 const db=await archive.openArchive();const began=Date.now();let attempted=new Set(),lastProgress=0;const publish=onProgress;onProgress=value=>{publish(value);if(value.phase!=='refresh'&&(value.phase!=='download'||Date.now()-lastProgress>400)){lastProgress=Date.now();db.put('settings',{id:'collection-progress',value,time:Date.now()}).catch(()=>{});}};
 try{while(!signal?.aborted&&Date.now()-began<maxDuration){
  const control=await db.get('settings',CONTROL);if(!control?.running)break;
  const o=control.options||{};if(o.totalFiles&&control.completed>=o.totalFiles||o.totalBytes&&control.transferred>=o.totalBytes){await updateControl(db,fresh=>fresh.session===control.session?{...fresh,running:false}:fresh);onProgress({phase:'complete',message:'Selected collection limit reached. Saved progress is preserved.'});break;}let versions=await db.getAll('versions');
  if(control.discover!==false&&(!control.discoveredAt||Date.now()-control.discoveredAt>300000)){
   onProgress({phase:'discover',message:'Finding signed site publications…'});
   const discovered=await lock(()=>discover(db,o.relays||[],{targets:o.targets||[],maxQueries:Math.min(o.maxQueries||8,8),signal,onProgress:v=>onProgress({phase:'discover',...v})}));
   Object.assign(control,await updateControl(db,fresh=>fresh.session===control.session?{...fresh,discoveredAt:Date.now(),discoveryPending:discovered.paused}:fresh));if(!control.running)break;versions=await db.getAll('versions');
  }
  // Read available pages before choosing more assets so confirmed campaigns
  // cannot keep consuming bandwidth while their descriptions remain unexamined.
  await lock(()=>indexArchive(db,{signal,onProgress}));
  const [pages,jobs,settings]=await Promise.all(['pages','jobs','settings'].map(s=>db.getAll(s)));
  const catalog=buildCatalog(versions,pages,jobs,settings),excluded=new Set(catalog.sites.filter(s=>s.excluded).map(s=>s.id)),owners=new Map();
  for(const v of versions)if(!excluded.has(v.site))for(const f of v.files){if(!owners.has(f.hash))owners.set(f.hash,[]);owners.get(f.hash).push({site:v.site,path:f.path,pubkey:v.event.pubkey});}
  const selected=jobs.filter(j=>j.state!=='complete'&&owners.has(j.id)&&(!control.site||owners.get(j.id).some(x=>x.site===control.site))&&(!control.hash||j.id===control.hash));
  selected.sort((a,b)=>(control.priorityHash===b.id)-(control.priorityHash===a.id)||Number(!owners.get(a.id).some(x=>/\.(html?|txt)$/i.test(x.path)))-Number(!owners.get(b.id).some(x=>/\.(html?|txt)$/i.test(x.path)))||(a.attempts||0)-(b.attempts||0));
  if(!selected.length&&control.discoveryPending){await updateControl(db,fresh=>fresh.session===control.session?{...fresh,discoveredAt:0}:fresh);onProgress({phase:'waiting',message:'Continuing relay discovery…'});break;}
  if(!selected.length){const fresh=await db.get('settings',CONTROL);if(fresh.discover!==false&&!control.site&&!control.hash&&Date.now()-control.discoveredAt<300000){onProgress({phase:'waiting',message:'All known eligible files are saved. Watching for more publications…',nextRetry:control.discoveredAt+300000});break;}await updateControl(db,value=>value.session===control.session?{...value,running:false}:value);onProgress({phase:'complete',message:'Selected downloads are complete.'});break;}
  let job=selected.find(j=>!attempted.has(j.id)&&(j.nextRetry||0)<=Date.now());
  if(!job){onProgress({phase:'waiting',message:'Waiting to retry unavailable files automatically…',nextRetry:Math.min(...selected.map(j=>j.nextRetry||Date.now()+5000))});break;}
  attempted.add(job.id);const owner=owners.get(job.id)[0];
  if(!job.origins.length&&!o.servers?.length){
   for(const relay of (o.relays||[]).slice(0,2)){
    const hintKey='server-lookup:'+relay+':'+owner.pubkey,last=await db.get('settings',hintKey);if(last&&Date.now()-last.time<300000)continue;
    onProgress({phase:'servers',path:owner.path,message:'Finding this publisher’s download servers…'});
    try{const hints=await queryRelay(relay,{kinds:[10063],authors:[owner.pubkey]},{timeout:6000,limit:4});await lock(async()=>{for(const event of hints.events)if(event.pubkey===owner.pubkey)await archive.importServers(db,event,relay);});}catch{}
    await db.put('settings',{id:hintKey,time:Date.now()});job=await db.get('jobs',job.id);if(job.origins.length)break;
   }
  }
  await lock(async()=>{
   const current=await db.get('jobs',job.id);if(current.state==='complete')return;
   const result=await transfer(db,{...current,...owner},{...o,maxTransferBytes:o.totalBytes?Math.max(0,o.totalBytes-(control.transferred||0)):Infinity,signal,onProgress});
   await updateControl(db,fresh=>fresh.session===control.session?{...fresh,transferred:(fresh.transferred||0)+result.bytes,completed:(fresh.completed||0)+(result.complete?1:0)}:fresh);
   if(result.complete)await indexArchive(db,{hash:job.id,signal,onProgress});
  });
  onProgress({phase:'refresh'});
  if(control.hash){const fresh=await db.get('settings',CONTROL);await updateControl(db,value=>value.session===control.session?{...value,running:false}:value);break;}
  await new Promise(r=>setTimeout(r,0));
 }}catch(e){if(!signal?.aborted){if(e.name==='QuotaExceededError'){await updateControl(db,{running:false});}onProgress({phase:'error',error:e.name==='QuotaExceededError'?'Phone storage is full. Saved files remain intact; back up or free space.':e.message});}}
 finally{db.close();}
}
