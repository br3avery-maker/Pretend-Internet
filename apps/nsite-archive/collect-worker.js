import {openArchive,collectFiles,discover,indexPages} from './vendor/collector-engine.js';
let controller;
self.onmessage=async({data})=>{
  if(data.type==='pause'){controller?.abort();return;}
  if(data.type!=='collect'||controller)return;
  controller=new AbortController();const signal=controller.signal;let db;
  const progress=value=>self.postMessage({type:'progress',value});
  async function run() {
    db=await openArchive();const o=data.options;
    const first=await collectFiles(db,{...o,signal,onProgress:progress});
    const discovery=signal.aborted?{events:0,paused:true}:await discover(db,o.relays,{targets:o.targets,refresh:o.refresh,maxQueries:o.maxQueries,signal,onProgress:progress});
    let second={paused:false};
    if(!signal.aborted&&first.bytes<o.maxBytes&&first.count<o.maxFiles)second=await collectFiles(db,{...o,maxBytes:o.maxBytes-first.bytes,maxFiles:o.maxFiles-first.count,signal,onProgress:progress});
    const indexed=signal.aborted?{indexed:0,paused:true}:await indexPages(db,{signal});
    // Tree reconstruction is performed on demand for a selected site, never
    // across every historical snapshot at the end of each collection run.
    self.postMessage({type:'done',discovery,indexed,paused:signal.aborted||first.paused||second.paused||discovery.paused});
  }
  try {
    if(navigator.locks)await navigator.locks.request('nsite-archive-writer',{ifAvailable:true},async lock=>{if(!lock)throw Error('Archive is busy in another tab.');await run();});
    else await run();
  } catch(e) {self.postMessage({type:'error',message:e.name==='QuotaExceededError'?'Storage quota reached. Pending downloads are preserved.':e.message});}
  finally {db?.close();controller=null;}
};
