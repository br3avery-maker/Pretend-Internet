const activity=document.querySelector('#activity-message'),controls=document.querySelector('#activity-controls');
let worker,sequence=0,pending=new Map();export let busy=false;let collecting=false;
function connect(){
 worker=new Worker(new URL('./archive-worker.js',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{if(data.progress){activity.textContent=data.progress;return;}const request=pending.get(data.id);if(!request)return;pending.delete(data.id);data.error?request.reject(Error(data.error)):request.resolve(data.result);};
 worker.onerror=()=>{for(const request of pending.values())request.reject(Error('Archive worker stopped. Reload to resume; saved data is preserved.'));pending.clear();};
}
export const rpc=(method,args={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,method,args});});
export function setCollecting(value){collecting=value;setBusy();}
export function message(text){activity.textContent=text;}
export function setBusy(){
 document.querySelectorAll('[data-write]').forEach(el=>el.disabled=busy||collecting||el.hasAttribute('data-unavailable'));
 document.querySelectorAll('[data-action="pause"]').forEach(el=>el.disabled=!collecting);
 document.querySelector('#cancel-task')?.remove();
 if(busy){const button=document.createElement('button');button.id='cancel-task';button.textContent='Cancel operation';button.onclick=()=>{worker.terminate();for(const request of pending.values())request.reject(Error('Operation cancelled. Completed writes are preserved.'));pending.clear();connect();busy=false;message('Cancelled. Saved data is preserved.');setBusy();};controls.append(button);}
}
function download({name,blob}){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export async function operation(method,args={},status='Working…'){
 if(busy||collecting){message('Pause collection or wait for the current operation to finish.');return;}
 busy=true;message(status);setBusy();
 try{const result=await rpc(method,args);if(result?.blob)download(result);message(method==='importEvents'?`Imported ${result.accepted} signed events; ${result.rejected} rejected; ${result.quarantined} quarantined.`:method==='importArchive'?`Restored ${result.events} signed events and ${result.blobs} verified files.`:method==='index'?`Indexed ${result.indexed} pages; ${result.failures.length} failures remain.`:'Finished.');window.dispatchEvent(new Event('archivechange'));return result;}
 catch(error){message(error.message);}finally{busy=false;setBusy();}
}
document.querySelector('#app').addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(['exportArchive','directory','index'].includes(action))operation(action,{},action==='index'?'Indexing verified page text…':'Preparing export…');});
document.querySelector('#app').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(e.target.id==='event-import')operation('importEvents',{file},'Verifying signed events…');if(e.target.id==='archive-import')operation('importArchive',{file},'Verifying archive backup…');});
window.addEventListener('pagecontent',setBusy);
window.addEventListener('pagehide',()=>worker.terminate());
window.addEventListener('pageshow',e=>{if(e.persisted){connect();busy=false;collecting=false;setBusy();}});
connect();
