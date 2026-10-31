import * as engine from './vendor/archive-engine.js';
import { buildCatalog,listCatalog,materialize,diffFiles } from './model.js';
let db,catalog;
const open=async()=>db??=await engine.openArchive();
async function refresh() {
  const d=await open();
  const [versions,pages,jobs,settings]=await Promise.all(['versions','pages','jobs','settings'].map(s=>d.getAll(s)));
  catalog=buildCatalog(versions,pages.filter(p=>p.extractor===engine.extractor),jobs,settings);
}
async function getVersion(site,id) {
  if(!catalog) await refresh();
  const summary=catalog.sites.find(s=>s.id===site);
  if(!summary||summary.excluded) throw Error('This publication is excluded from the library.');
  return materialize(catalog.bySite.get(site),id||catalog.bySite.get(site)[0].id);
}
const progress=value=>self.postMessage({progress:value});
async function write(fn) {
  const run=async()=>{try {return await fn();} finally {catalog=null;}};
  return navigator.locks?navigator.locks.request('nsite-archive-writer',{ifAvailable:true},lock=>{
    if(!lock) throw Error('Archive is busy in another tab.');
    return run();
  }):run();
}
const handlers={
  async invalidate(){catalog=null;return true;},
  async list(options) {if(!catalog||options.refresh) await refresh();return listCatalog(catalog,options);},
  async detail({site,version}) {
    const v=await getVersion(site,version),all=catalog.bySite.get(site),summary=catalog.sites.find(s=>s.id===site);
    const files=v.files.map(f=>({...f,verified:catalog.jobMap.get(f.hash)?.state==='complete',page:catalog.pageMap.get(`${f.hash}\n${f.path}`)?.data}));
    const related=catalog.sites.filter(s=>s.id!==site&&!s.excluded&&!s.hidden&&s.publisher===summary.publisher).slice(0,40).map(({search,...s})=>s);
    const relationships=[],targetHashes=new Set(v.files.map(f=>f.hash));
    for(const candidate of catalog.sites) {
      if(candidate.id===site||candidate.excluded||candidate.hidden)continue;
      const other=catalog.latestBySite.get(candidate.id),hashes=new Set(other.files.map(f=>f.hash));
      let shared=0;for(const hash of targetHashes)if(hashes.has(hash))shared++;
      const union=targetHashes.size+hashes.size-shared;
      if(v.nativeHash===other.nativeHash)relationships.push({id:candidate.id,title:candidate.title,type:'Identical file tree'});
      else if(shared>=2&&union&&shared/union>=0.8)relationships.push({id:candidate.id,title:candidate.title,type:'Similar content; inferred relationship'});
      if(relationships.length>=40)break;
    }
    return {summary,version:v,files,related,relationships,history:all.map(x=>({id:x.id,created:x.event.created_at,legacy:x.legacy})),hidden:summary.hidden};
  },
  async status() {
    const d=await open();
    const [jobs,scans,failures,events]=await Promise.all(['jobs','scans','index-failures','events'].map(s=>d.getAll(s)));
    return {jobs:jobs.length,complete:jobs.filter(j=>j.state==='complete').length,
      errors:[...jobs.filter(j=>j.error).map(j=>({target:j.id,error:j.error})),...scans.filter(j=>j.error).map(j=>({target:j.relay,error:j.error})),...failures.map(j=>({target:j.path,error:j.error}))].slice(0,100),
      gaps:scans.filter(s=>s.gaps?.length).length,quarantined:events.filter(e=>e.error).length};
  },
  async hide({site,hidden}) {return write(async()=>{await (await open()).put('settings',{id:'hidden:'+site,hidden});return true;});},
  async compare({site,before,after}) {
    const a=await getVersion(site,before),b=await getVersion(site,after),d=await open(),blobs=new Map();
    for(const hash of new Set([...a.files,...b.files].map(f=>f.hash))) {const value=await d.get('blobs',hash);if(value)blobs.set(hash,value);}
    return diffFiles(a,b,blobs);
  },
  async restore({site,version}) {
    const v=await getVersion(site,version),d=await open(),files=Object.create(null);
    for(let i=0;i<v.files.length;i++) {const f=v.files[i];progress(`Verifying ${i+1} of ${v.files.length} files…`);files[f.path.slice(1)]=await engine.readBlob(d,f.hash);}
    return {name:`nsite-${v.id.slice(0,12)}.zip`,blob:new Blob([engine.zip(files)],{type:'application/zip'})};
  },
  async importEvents({file}) {return write(async()=>{
    const d=await open(),text=await file.text();let parsed;
    try {const json=JSON.parse(text);parsed=Array.isArray(json)?json:[json];}
    catch {parsed=text.split(/\r?\n/).filter(s=>s.trim()).map(JSON.parse);}
    if(!Array.isArray(parsed))throw Error('Choose a signed event, event array, or NDJSON file.');
    let accepted=0,rejected=0,quarantined=0;
    for(let i=0;i<parsed.length;i++) {
      const event=parsed[i];
      try {let result;if(event.kind===10063)await engine.importServers(d,event,'file-import');else if(event.kind===10002)await engine.importRelays(d,event,'file-import');else result=await engine.importEvent(d,event,'file-import');accepted++;if(result?.quarantined)quarantined++;}
      catch(e){if(e.name==='QuotaExceededError')throw e;rejected++;}
      if(i%16===0) {progress(`Importing ${i+1} of ${parsed.length} signed events…`);await new Promise(r=>setTimeout(r,0));}
    }
    return {accepted,rejected,quarantined};
  });},
  async exportArchive() {return write(async()=>({name:'nsite-archive.json',blob:await engine.exportArchive(await open())}));},
  async importArchive({file}) {return write(async()=>{
    const d=await open(),result=await engine.importArchive(d,file);
    progress('Rebuilding searchable text from verified files…');await engine.indexPages(d);return result;
  });},
  async index() {return write(()=>open().then(d=>engine.indexPages(d,{retry:true})));},
  async directory() {
    if(!catalog)await refresh();const d=await open();
    const sites=catalog.sites.filter(s=>!s.excluded&&!s.hidden),allowedEvents=new Set(sites.flatMap(s=>catalog.bySite.get(s.id).map(v=>v.event.id)));
    const data={schema:'nsite-archive.browser-directory.v2',sites:sites.map(({search,...s})=>({...s,
      files:catalog.latestBySite.get(s.id).files,
      versions:catalog.bySite.get(s.id).map(v=>({id:v.id,created:v.event.created_at,legacy:v.legacy,nativeHash:v.nativeHash})),
      pages:catalog.latestBySite.get(s.id).files.flatMap(f=>{const p=catalog.pageMap.get(`${f.hash}\n${f.path}`);return p?[{path:f.path,hash:f.hash,...p.data}]:[];})})),
      events:(await d.getAll('events')).filter(e=>allowedEvents.has(e.id)).map(e=>e.event),sources:(await d.getAll('sources')).filter(s=>allowedEvents.has(s.event))};
    return {name:'nsite-directory.json',blob:new Blob([JSON.stringify(data)],{type:'application/json'})};
  }
};
self.onmessage=async({data:{id,method,args={}}})=>{
  try {if(!handlers[method])throw Error('Unknown archive operation.');const result=await handlers[method](args);self.postMessage({id,result});}
  catch(error){self.postMessage({id,error:error.name==='QuotaExceededError'?'Storage quota reached. Saved data is preserved; back up before freeing space.':error.message});}
};
