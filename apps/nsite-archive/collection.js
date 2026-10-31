import {busy,rpc,setCollecting,message} from './archive-client.js';
const defaults={relays:'wss://relay.nsite.lol\nwss://relay.damus.io',servers:'',targets:'',proxy:'',maxBytes:67108864,maxBlobBytes:33554432,maxFiles:128,maxQueries:32,refresh:false};
let saved;try{saved=JSON.parse(localStorage.getItem('nsite.collection-settings')||'null');}catch{}
export const settings={...defaults,...saved};
for(const key of ['relays','servers','proxy'])if(!saved&&localStorage.getItem('nsite.'+key))settings[key]=localStorage.getItem('nsite.'+key);
let collector=null;
export const isCollecting=()=>Boolean(collector);
export function start(){
 if(busy||collector)return;
 const options={...settings,relays:settings.relays.split(/\s+/).filter(Boolean),targets:settings.targets.split(/\s+/).filter(Boolean),servers:settings.servers.split(/\s+/).filter(Boolean),proxy:settings.proxy.trim()};
 if(!['maxBytes','maxBlobBytes','maxFiles','maxQueries'].every(k=>Number.isSafeInteger(options[k])&&options[k]>0)){message('Resource limits must be positive whole numbers.');return;}
 if(!options.relays.length){message('Enter at least one relay URL.');return;}
 const run=new Worker(new URL('./collect-worker.js',import.meta.url),{type:'module'});collector=run;setCollecting(true);message('Starting collection…');
 const finish=async text=>{if(collector!==run)return;run.terminate();collector=null;setCollecting(false);message(text);await rpc('invalidate');window.dispatchEvent(new Event('archivechange'));};
 run.onmessage=({data})=>{if(data.type==='progress'){const v=data.value;message(v.error||[v.events!==undefined?`${v.events} events discovered`:null,v.count!==undefined?`${v.count} file attempts`:null,v.bytes!==undefined?`${Math.round(v.bytes/1024)} KiB transferred`:null,v.status].filter(Boolean).join(' · ')||'Collecting…');}else if(data.type==='done')finish(`${data.paused?'Paused with saved progress':'Run finished'} · ${data.discovery.events} signed events discovered. Pending failures are listed in Collect.`).catch(error=>message(error.message));else if(data.type==='error')finish(data.message).catch(error=>message(error.message));};
 run.onerror=()=>finish('Collection worker stopped. Saved downloads are preserved; resume to retry.').catch(error=>message(error.message));run.postMessage({type:'collect',options});
}
export async function pause(){if(!collector)return;collector.terminate();collector=null;setCollecting(false);message('Paused. Saved files and pending jobs are preserved.');await rpc('invalidate');window.dispatchEvent(new Event('archivechange'));}
window.addEventListener('pagehide',()=>{if(collector){collector.terminate();collector=null;setCollecting(false);sessionStorage.setItem('nsite.collection-paused','true');}});
if(sessionStorage.getItem('nsite.collection-paused')){sessionStorage.removeItem('nsite.collection-paused');message('Collection paused when you left this page. Resume to continue saved jobs.');}
