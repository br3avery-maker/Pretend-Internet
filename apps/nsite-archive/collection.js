import {rpc,setCollecting,message} from './archive-client.js';
const defaults={relays:'wss://relay.nsite.lol\nwss://relay.damus.io',servers:'',targets:'',proxy:'',maxBlobBytes:33554432,maxQueries:8,totalBytes:0,totalFiles:0};
let saved;try{saved=JSON.parse(localStorage.getItem('nsite.collection-settings')||'null');}catch{}
export const settings={...defaults,...saved};let fallback,initializing,progressTimer,active=false,waking=false,lastRefresh=0;
export const isCollecting=()=>active;
function receive(v){
 const phase=v.phase||'download';
 if(phase==='refresh'){if(Date.now()-lastRefresh>1500){lastRefresh=Date.now();rpc('invalidate').then(()=>window.dispatchEvent(new Event('archivechange')));}return;}
 let text=v.error||v.message;
 if(!text&&phase==='download')text=`Downloading ${v.path||'file'} · ${Math.round((v.loaded||0)/1024)}${v.total?' / '+Math.round(v.total/1024):''} KiB${v.total?' · '+Math.floor(v.loaded/v.total*100)+'%':''}`;
 if(!text&&phase==='index')text='Reading '+v.path+'…';if(!text&&phase==='verify')text='Verifying '+(v.path||'download')+'…';
 if(!text&&phase==='discover')text=`Discovering sites${v.events!==undefined?' · '+v.events+' signed events':''}`;
 if(text)message(text);
 window.dispatchEvent(new CustomEvent('collectionprogress',{detail:v}));
}
async function wake(){
 if(waking)return;waking=true;
 try{const state=await rpc('collectionState');active=Boolean(state.running);setCollecting(active);if(!active)return;
 fallback??=new Worker(new URL('./collect-worker.js',import.meta.url),{type:'module'});fallback.onmessage=({data})=>{if(data.type==='progress')receive(data.value);};fallback.onerror=()=>{fallback?.terminate();fallback=null;message('Collection worker stopped. Saved progress will resume automatically.');};fallback.postMessage({type:'collect'});
 }catch(e){message(e.message);}finally{waking=false;}
}
export async function initCollection(){
 if(initializing)return initializing;
 initializing=(async()=>{
  const previous=await rpc('collectionProgress');if(previous?.value)receive(previous.value);
  rpc('prepare').then(changed=>{if(changed)window.dispatchEvent(new Event('archivechange'));}).catch(e=>message(e.message));
  await wake();progressTimer=setInterval(wake,10000);
 })();return initializing;
}
export async function start({site,hash}={}){
 await initCollection();
 const options={...settings,relays:settings.relays.split(/\s+/).filter(Boolean),servers:settings.servers.split(/\s+/).filter(Boolean),targets:settings.targets.split(/\s+/).filter(Boolean),proxy:settings.proxy.trim()};
 if(!options.relays.length&&!site&&!hash){message('Enter a relay or select an item to download.');return;}
 if(!Number.isSafeInteger(options.maxBlobBytes)||options.maxBlobBytes<1||!['totalBytes','totalFiles'].every(k=>Number.isSafeInteger(options[k])&&options[k]>=0)){message('Enter valid file and transfer limits.');return;}
 await rpc('collectionControl',{running:true,options,site:site||null,hash:hash||null,discover:!site&&!hash,reset:true});
 message(site||hash?'Downloading selected item…':'Starting collection…');await wake();
}
export async function pause(){await rpc('collectionControl',{running:false});fallback?.postMessage({type:'pause'});active=false;setCollecting(false);message('Paused. Saved files and partial downloads are preserved.');await rpc('invalidate');window.dispatchEvent(new Event('archivechange'));}
window.addEventListener('pagehide',()=>{clearInterval(progressTimer);fallback?.terminate();fallback=null;});
window.addEventListener('pageshow',e=>{if(e.persisted){initializing=null;initCollection();}});
window.addEventListener('collection-command',e=>{start(e.detail||{}).catch(error=>message(error.message));});
