const app=document.querySelector('#app'), activity=document.querySelector('#activity-message'), activityControls=document.querySelector('#activity-controls');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=value=>value.length>28?value.slice(0,14)+'…'+value.slice(-8):value;
const date=value=>new Date(value*1000).toLocaleString();
const route=(screen,values={})=>'#/'+screen+(Object.keys(values).length?'?'+new URLSearchParams(values):'');
const safeGet=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{activity.textContent='Preferences could not be saved; archive data is unchanged.';}};
let worker,sequence=0,revision=0,pending=new Map(),busy=false,collector=null,currentDetail=null;
const defaults={relays:'wss://relay.nsite.lol\nwss://relay.damus.io',servers:'',targets:'',proxy:'',maxBytes:67108864,maxBlobBytes:33554432,maxFiles:128,maxQueries:32,refresh:false};
const settings={...defaults,...safeGet('nsite.collection-settings',{})};
// Preserve the previous APK's preferences and database name.
for(const field of ['relays','servers','proxy'])if(!localStorage.getItem('nsite.collection-settings')&&localStorage.getItem('nsite.'+field))settings[field]=localStorage.getItem('nsite.'+field);
function connect(){
  worker=new Worker(new URL('./archive-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(data.progress){activity.textContent=data.progress;return;}
    const request=pending.get(data.id);if(!request)return;pending.delete(data.id);
    data.error?request.reject(Error(data.error)):request.resolve(data.result);
  };
  worker.onerror=()=>{for(const r of pending.values())r.reject(Error('Archive worker stopped. Reload to resume; saved data is preserved.'));pending.clear();};
}
function rpc(method,args={}){const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,method,args});});}
function download({name,blob}){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function operation(method,args={},message='Working…'){
  if(busy||collector){activity.textContent='Pause collection or wait for the current operation to finish.';return;}
  busy=true;activity.textContent=message;setBusy();
  try{const result=await rpc(method,args);if(result?.blob)download(result);activity.textContent=method==='importEvents'?`Imported ${result.accepted} signed events; ${result.rejected} rejected; ${result.quarantined} quarantined.`:method==='importArchive'?`Restored ${result.events} signed events and ${result.blobs} verified files.`:method==='index'?`Indexed ${result.indexed} pages; ${result.failures.length} failures remain.`:'Finished.';await render(true);return result;}
  catch(e){activity.textContent=e.message;}
  finally{busy=false;setBusy();}
}
function setBusy(){document.querySelectorAll('[data-write]').forEach(el=>el.disabled=busy||Boolean(collector)||el.hasAttribute('data-unavailable'));document.querySelectorAll('[data-action="pause"]').forEach(el=>el.disabled=!collector);document.querySelector('#cancel-task')?.remove();if(busy){const b=document.createElement('button');b.id='cancel-task';b.textContent='Cancel operation';b.onclick=()=>{worker.terminate();for(const p of pending.values())p.reject(Error('Operation cancelled. Completed writes are preserved.'));pending.clear();connect();busy=false;activity.textContent='Cancelled. Saved data is preserved.';setBusy();};activityControls.append(b);}}
function locationState(){const [path,query='']=location.hash.slice(2).split('?');return {screen:path||'library',params:new URLSearchParams(query)};}
function back(fallback='#/library'){return `<a class="back" href="${escape(fallback)}" data-back>‹ Back</a>`;}
function filePicker(id,label){return `<label class="button"><span>${label}</span><input class="file-input" id="${id}" type="file" accept=".json,.ndjson,application/json" data-write></label>`;}
const noData='<div class="empty"><strong>Your library is empty.</strong><p>Collect publications from relays or import signed events. Saved sites will appear here.</p><a class="button primary" href="#/collect">Collect sites</a></div>';
function siteRow(s){return `<a class="row" href="${escape(route('site',{site:s.id}))}"><strong>${escape(s.title)}</strong>${s.description?`<span class="description">${escape(s.description)}</span>`:''}<small>${escape(short(s.publisher))} · ${s.publisherCount??''}${s.publisherCount?' sites · ':''}${s.versions} versions · ${s.verified}/${s.files} files verified</small></a>`;}

async function library(params,token,refresh){
  sessionStorage.setItem('nsite.last-library',location.hash||'#/library');
  const query=params.get('q')||'',sort=params.get('sort')||safeGet('nsite.sort','recent'),publisher=params.get('publisher')||'',limit=Number(params.get('limit'))||40;
  const hidden=params.get('hidden')==='1';
  const data=await rpc('list',{query,sort,publisher,hidden,limit,refresh});if(token!==revision)return;
  app.innerHTML=`<div class="topline"><h1>${publisher?'Publisher sites':'Library'}</h1><a class="button" href="#/collect">Collect</a></div>${publisher?back('#/publishers'):''}<form id="search-form" class="toolbar"><label class="search-field">Search<input name="q" type="search" value="${escape(query)}" placeholder="Search sites, text, publishers"></label><button type="submit">Search</button><label>Sort<select id="sort">${[['recent','Latest update'],['title','Title'],['files','File count'],['publisher-count','Sites per publisher']].map(([v,l])=>`<option value="${v}" ${v===sort?'selected':''}>${l}</option>`).join('')}</select></label></form><p class="stats">${data.total} ${data.total===1?'site':'sites'}${data.excluded?` · ${data.excluded} confirmed campaign sites excluded`:''}</p><label><input id="show-hidden" type="checkbox" ${hidden?'checked':''}>Include manually hidden sites</label>${data.rows.length?data.rows.map(siteRow).join(''):query||publisher?'<div class="empty"><strong>No matching sites.</strong><p>Try another search.</p></div>':noData}${data.total>limit?`<a class="button" href="${escape(route('library',{q:query,sort,publisher,hidden:hidden?'1':'0',limit:limit+40}))}">Show 40 more</a>`:''}`;
  const update=values=>{location.hash=route('library',{q:query,sort,publisher,hidden:hidden?'1':'0',...values});};
  document.querySelector('#search-form').onsubmit=e=>{e.preventDefault();update({q:new FormData(e.target).get('q')});};
  document.querySelector('#sort').onchange=e=>{save('nsite.sort',e.target.value);update({sort:e.target.value});};
  document.querySelector('#show-hidden').onchange=e=>update({hidden:e.target.checked?'1':'0'});
}
async function publishers(params,token,refresh){
  const data=await rpc('list',{refresh,limit:0});if(token!==revision)return;
  const limit=Number(params.get('limit'))||40;
  app.innerHTML=`<h1>Publishers</h1><p class="stats">${data.publishers.length} publishers · sorted by site count</p>${data.publishers.slice(0,limit).map(p=>`<a class="row" href="${escape(route('library',{publisher:p.id}))}"><strong>${p.count} ${p.count===1?'site':'sites'}</strong><small>${escape(p.id)}</small></a>`).join('')||noData}${data.publishers.length>limit?`<a class="button" href="${escape(route('publishers',{limit:limit+40}))}">Show more publishers</a>`:''}`;
}
async function site(params,token){
  const id=params.get('site');if(!id)throw Error('Site address is missing.');
  const data=await rpc('detail',{site:id,version:params.get('version')||undefined});if(token!==revision)return;currentDetail=data;
  const v=data.version;
  app.innerHTML=`${back(sessionStorage.getItem('nsite.last-library')||'#/library')}<h1>${escape(data.summary.title)}</h1>${data.summary.description?`<p>${escape(data.summary.description)}</p>`:''}<p class="stats">${date(v.event.created_at)} · ${v.files.length} declared files${v.legacy?' · reconstructed legacy tree':''}</p><div class="actions"><button class="primary" data-write data-action="restore" ${data.files.some(f=>!f.verified)?'disabled data-unavailable':''}>Restore verified ZIP</button><a class="button" href="${escape(route('history',{site:id}))}">Version history (${data.history.length})</a><button data-write data-action="hide">${data.hidden?'Unhide site':'Hide site'}</button></div>${data.files.some(f=>!f.verified)?'<p class="notice">Some files are pending. Resume collection before restoring this version.</p>':''}<h2>Pages & files</h2>${data.files.map(f=>`<div class="file-row">${f.page?`<a href="${escape(route('page',{site:id,version:v.id,path:f.path}))}"><strong>${escape(f.page.title||f.path)}</strong></a><div class="muted">${escape(f.path)}</div>`:`<strong>${escape(f.path)}</strong>`}<span class="badge">${f.verified?'Verified':'Pending collection'}</span>${f.page?.description?`<p>${escape(f.page.description)}</p>`:''}</div>`).join('')}<details><summary>Publication details</summary><dl class="metadata"><dt>Publisher</dt><dd><a href="${escape(route('library',{publisher:v.event.pubkey}))}">${escape(v.event.pubkey)}</a></dd><dt>Namespace</dt><dd>${escape(id)}</dd><dt>Event</dt><dd>${escape(v.event.id)}</dd><dt>Native hash</dt><dd>${escape(v.nativeHash)}</dd></dl>${v.relations.length?`<h3>Declared relationships</h3>${v.relations.map(r=>`<p class="wrap">${escape(r.type)}: ${escape(r.target)} (publisher claim)</p>`).join('')}`:''}<p class="muted">Verified declared files and external page dependencies are counted separately. Legacy history represents observed signed file updates.</p></details>${data.relationships.length?`<h2>Related content</h2>${data.relationships.map(r=>`<a class="row" href="${escape(route('site',{site:r.id}))}"><strong>${escape(r.title)}</strong><small>${escape(r.type)}</small></a>`).join('')}`:''}${data.related.length?`<h2>More from this publisher</h2>${data.related.map(siteRow).join('')}`:''}`;
}
async function versionHistory(params,token){
  const id=params.get('site'),data=await rpc('detail',{site:id});if(token!==revision)return;currentDetail=data;
  const limit=Number(params.get('limit'))||40;
  app.innerHTML=`${back(route('site',{site:id}))}<h1>Version history</h1><p>${escape(data.summary.title)}</p>${data.history.length>1?`<form id="compare-form"><div class="columns"><label>Older version<select name="before">${data.history.slice(1).map(v=>`<option value="${v.id}">${escape(date(v.created))} · ${short(v.id)}</option>`).join('')}</select></label><label>Newer version<select name="after">${data.history.map(v=>`<option value="${v.id}">${escape(date(v.created))} · ${short(v.id)}</option>`).join('')}</select></label></div><button class="primary">Compare versions</button></form>`:''}${data.history.slice(0,limit).map(v=>`<a class="row" href="${escape(route('site',{site:id,version:v.id}))}"><strong>${date(v.created)}</strong><small>${escape(v.id)}${v.legacy?' · legacy observation':''}</small></a>`).join('')}${data.history.length>limit?`<a class="button" href="${escape(route('history',{site:id,limit:limit+40}))}">Show earlier versions</a>`:''}`;
  document.querySelector('#compare-form')?.addEventListener('submit',e=>{e.preventDefault();const form=new FormData(e.target);location.hash=route('compare',{site:id,before:form.get('before'),after:form.get('after')});});
}
async function compare(params,token){
  const changes=await rpc('compare',Object.fromEntries(params));if(token!==revision)return;
  app.innerHTML=`${back(route('history',{site:params.get('site')}))}<h1>Version comparison</h1><p>${changes.length} changed paths</p>${changes.map(c=>`<div class="file-row"><span class="badge">${escape(c.status)}</span><strong class="wrap"> ${escape(c.path)}</strong>${c.status==='changed'?`<p class="muted">${c.reusedBytes===null?'Collect both versions for chunk comparison.':c.reusedBytes+' unchanged chunk bytes reused.'}</p>`:''}</div>`).join('')||'<p>These versions contain the same files.</p>'}`;
}
async function page(params,token){
  const data=await rpc('detail',{site:params.get('site'),version:params.get('version')});if(token!==revision)return;
  const f=data.files.find(f=>f.path===params.get('path'));if(!f?.page)throw Error('This page has not been indexed. Collect the file or retry indexing.');
  app.innerHTML=`${back(route('site',{site:params.get('site'),version:data.version.id}))}<article><h1>${escape(f.page.title||f.path)}</h1><p class="muted wrap">${escape(f.path)} · text from verified archived bytes</p><div class="page-text">${escape(f.page.text)}</div></article>${f.page.resources?.length?`<details><summary>Referenced resources</summary><ul>${f.page.resources.map(r=>`<li>${escape(r.url)} · ${r.external?'external; not collected':data.version.files.some(f=>{try{return decodeURIComponent(f.path)===decodeURIComponent(r.url);}catch{return false;}})?'declared in manifest':'not declared in manifest'}</li>`).join('')}</ul></details>`:''}`;
}
async function collect(params,token){
  const numeric=[['maxBytes','Transfer bytes per run'],['maxBlobBytes','Maximum bytes per file'],['maxFiles','File attempts per run'],['maxQueries','Relay queries per run']];
  app.innerHTML=`<h1>Collect sites</h1><p class="muted">Download signed publications into your local archive.</p><div class="actions"><button class="primary" data-action="start" data-write>Start / resume</button><button data-action="pause" ${collector?'':'disabled'}>Pause</button>${filePicker('event-import','Import signed events')}</div><p id="collection-summary" class="stats">Loading saved progress…</p><label>Relay URLs<textarea data-setting="relays" rows="3">${escape(settings.relays)}</textarea></label><label>Selected nsite URLs <small>Optional. Leave empty to discover across your relays.</small><textarea data-setting="targets" rows="2">${escape(settings.targets)}</textarea></label><details><summary>Servers, proxy & resource limits</summary><label>Additional Blossom servers<textarea data-setting="servers" rows="3">${escape(settings.servers)}</textarea></label><label>Optional proxy URL<small>Used only after a direct fetch fails. The proxy sees requested URLs; downloaded bytes still require native hash verification.</small><input type="url" data-setting="proxy" value="${escape(settings.proxy)}"></label><div class="columns">${numeric.map(([k,l])=>`<label>${l}<input type="number" data-setting="${k}" min="1" step="1" value="${escape(settings[k])}"></label>`).join('')}</div><label><input type="checkbox" data-setting="refresh" ${settings.refresh?'checked':''}>Refresh completed relay scans</label></details><div class="actions"><button data-write data-action="index">Retry failed indexing</button></div><div id="collection-errors"></div>`;
  document.querySelectorAll('[data-setting]').forEach(el=>el.oninput=()=>{settings[el.dataset.setting]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;save('nsite.collection-settings',settings);});
  const data=await rpc('status');if(token!==revision)return;
  document.querySelector('#collection-summary').textContent=`${data.complete}/${data.jobs} files verified · ${data.gaps} scans with history gaps · ${data.quarantined} quarantined events`;
  document.querySelector('#collection-errors').innerHTML=data.errors.length?`<h2>Collection failures</h2><p class="muted">Pending jobs are saved and can be retried. Fetch failures may include CORS restrictions.</p>${data.errors.map(e=>`<div class="file-row"><small class="wrap">${escape(e.target)}</small><p>${escape(e.error)}</p></div>`).join('')}`:'';
}
async function backup(){
  app.innerHTML=`<h1>Backup & recovery</h1><p>Full backups contain original signed events, provenance, jobs, and verified file bytes. Restore merges validated records without deleting your current archive.</p><div class="actions"><button class="primary" data-write data-action="exportArchive">Export full archive</button>${filePicker('archive-import','Import full archive')}</div><h2>Directory index</h2><p class="muted">A lightweight index is useful for browsing and sharing metadata. It does not contain the bytes needed to restore an archive.</p><button data-write data-action="directory">Export directory index</button><h2>Storage</h2><p id="storage-status" class="muted">Checking storage…</p><button data-action="persist">Request persistent storage</button><p class="muted">Keep separate backups. Browser storage belongs to this origin; moving to a different gateway or APK origin requires export and import.</p>`;
  await storage();
}
async function storage(request=false){let persistent,estimate;try{persistent=await navigator.storage?.[request?'persist':'persisted']?.();estimate=await navigator.storage?.estimate?.();}catch{}const el=document.querySelector('#storage-status');if(el)el.textContent=(persistent?'Persistent storage granted. ':'Storage persistence is not guaranteed. ')+(estimate?`${Math.round(estimate.usage/1048576)} MiB used; approximately ${Math.round(estimate.quota/1048576)} MiB available to this origin.`:'Storage estimate unavailable.');}
function help(){app.innerHTML=`<h1>Help</h1><h2>Find and save sites</h2><p>Open Collect, choose relays or selected nsite URLs, and start. Signed events and their declared files are verified before they are treated as complete. You can also import signed JSON or NDJSON events. Pause, close, and resume later; completed files and pending jobs remain saved.</p><h2>Browse, search and recover</h2><p>The Library searches publisher metadata and indexed text from saved files. Open a site to read archived page text, inspect its versions, compare changed paths and chunk reuse, or restore verified files as a ZIP. Publishers groups useful sites by author and site count.</p><h2>Confirmed spam exclusion</h2><p>The manually confirmed campaign signatures are excluded from normal library results, searches, publisher groups and related-site suggestions. Existing raw records remain available in a full archive backup. Unrelated prolific publishers and one-page sites are not excluded by those characteristics.</p><h2>Privacy and networking</h2><p>Data stays in this browser's local IndexedDB database. No account, signer, or publication is required. Configured relays and file servers see requests; an explicitly configured proxy also sees requested URLs. CORS, unreachable servers and relay history limits may prevent complete collection. No downloaded site scripts run during text indexing.</p><h2>Storage and recovery</h2><p>Export full backups regularly. Browser storage is origin-specific and may be evicted. Import verifies signed events and object hashes before committing records. If an operation stalls, Cancel operation stops its worker; completed writes remain. Pause collection before importing or exporting.</p><h2>Coverage and limitations</h2><p>Declared-file coverage is separate from resources referenced in HTML or CSS. Legacy versions reconstruct observed signed file updates; they are not independently signed complete manifests. Browser suspension pauses progress. Screenshots, SIP publishing and cross-device sync are not provided by this build.</p>`;}
async function render(refresh=false){
  const token=++revision,{screen,params}=locationState();currentDetail=null;
  document.querySelector('#navigation').classList.remove('open');document.querySelector('#menu').setAttribute('aria-expanded','false');
  document.querySelectorAll('nav a').forEach(a=>{const active=a.hash===route(screen)||(screen==='site'||screen==='history'||screen==='compare'||screen==='page')&&a.hash==='#/library';active?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current');});
  app.innerHTML='<p class="muted" role="status">Opening…</p>';
  try {const renderers={library,publishers,site,history:versionHistory,compare,page,collect,backup,help};if(!renderers[screen])throw Error('Page not found.');await renderers[screen](params,token,refresh);if(token===revision){setBusy();app.focus({preventScroll:true});}}
  catch(e){if(token===revision)app.innerHTML=`<h1>Could not open this page</h1><p class="error">${escape(e.message)}</p><a class="button" href="#/library">Return to library</a>`;}
}
function start(){
  if(busy||collector)return;
  const options={...settings,relays:settings.relays.split(/\s+/).filter(Boolean),targets:settings.targets.split(/\s+/).filter(Boolean),servers:settings.servers.split(/\s+/).filter(Boolean),proxy:settings.proxy.trim()};
  if(!['maxBytes','maxBlobBytes','maxFiles','maxQueries'].every(k=>Number.isSafeInteger(options[k])&&options[k]>0)){activity.textContent='Resource limits must be positive whole numbers.';return;}
  if(!options.relays.length){activity.textContent='Enter at least one relay URL.';return;}
  const run=new Worker(new URL('./collect-worker.js',import.meta.url),{type:'module'});collector=run;setBusy();activity.textContent='Starting collection…';
  const finish=message=>{if(collector!==run)return;run.terminate();collector=null;activity.textContent=message;setBusy();rpc('invalidate').then(()=>render(true)).catch(e=>{activity.textContent=e.message;});};
  run.onmessage=({data})=>{if(data.type==='progress'){const v=data.value;activity.textContent=v.error||[v.events!==undefined?`${v.events} events discovered`:null,v.count!==undefined?`${v.count} file attempts`:null,v.bytes!==undefined?`${Math.round(v.bytes/1024)} KiB transferred`:null,v.status].filter(Boolean).join(' · ')||'Collecting…';}else if(data.type==='done')finish(`${data.paused?'Paused with saved progress':'Run finished'} · ${data.discovery.events} signed events discovered. Pending failures are listed in Collect.`);else if(data.type==='error')finish(data.message);};
  run.onerror=()=>finish('Collection worker stopped. Saved downloads are preserved; resume to retry.');
  run.postMessage({type:'collect',options});
}
function pause(){if(!collector)return;collector.terminate();collector=null;activity.textContent='Paused. Saved files and pending jobs are preserved.';setBusy();rpc('invalidate').then(()=>render(true)).catch(e=>{activity.textContent=e.message;});}
app.addEventListener('click',async e=>{
  const target=e.target.closest('[data-action],[data-back]');if(!target)return;
  if(target.hasAttribute('data-back'))return;
  const action=target.dataset.action;
  if(action==='start')return start();if(action==='pause')return pause();if(action==='persist')return storage(true);
  if(action==='restore'&&currentDetail)return operation('restore',{site:currentDetail.summary.id,version:currentDetail.version.id},'Verifying archived files…');
  if(action==='hide'&&currentDetail)return operation('hide',{site:currentDetail.summary.id,hidden:!currentDetail.hidden},'Updating visibility…');
  if(['exportArchive','directory','index'].includes(action))return operation(action,{},action==='index'?'Indexing verified page text…':'Preparing export…');
});
app.addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(e.target.id==='event-import')operation('importEvents',{file},'Verifying signed events…');if(e.target.id==='archive-import')operation('importArchive',{file},'Verifying archive backup…');});
document.querySelector('#menu').onclick=()=>{
  const open=!document.querySelector('#navigation').classList.contains('open');
  if(open){window.history.pushState({nsiteMenu:true},'',location.href);document.querySelector('#navigation').classList.add('open');}
  else {window.history.back();document.querySelector('#navigation').classList.remove('open');}
  document.querySelector('#menu').setAttribute('aria-expanded',String(open));
};
document.querySelector('#navigation').addEventListener('click',e=>{
  const link=e.target.closest('a');if(!link||!window.history.state?.nsiteMenu)return;
  e.preventDefault();window.history.replaceState(null,'',link.href);window.scrollTo(0,0);render();
});
window.addEventListener('popstate',()=>{document.querySelector('#navigation').classList.remove('open');document.querySelector('#menu').setAttribute('aria-expanded','false');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(window.history.state?.nsiteMenu)window.history.back();document.querySelector('#navigation').classList.remove('open');document.querySelector('#menu').setAttribute('aria-expanded','false');document.querySelector('#menu').focus();}});
const scrollPositions=new Map();
window.history.scrollRestoration='manual';
window.addEventListener('hashchange',async e=>{scrollPositions.set(new URL(e.oldURL).hash,window.scrollY);await render();window.scrollTo(0,scrollPositions.get(location.hash)||0);});
connect();render();
if('serviceWorker'in navigator&&isSecureContext)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
