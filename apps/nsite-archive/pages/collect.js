import {app,escape,short,date,route,back,lastLibrary,filePicker,noData,siteRow,mount,safeGet,save} from '../ui.js';
import {rpc,operation} from '../archive-client.js';
import { settings,start,pause,isCollecting } from '../collection.js';

async function renderPage(){
  const params=new URLSearchParams(location.search),refresh=true;
  const numeric=[['maxBytes','Transfer bytes per run'],['maxBlobBytes','Maximum bytes per file'],['maxFiles','File attempts per run'],['maxQueries','Relay queries per run']];
  app.innerHTML=`<h1>Collect sites</h1><p class="muted">Download signed publications into your local archive.</p><div class="actions"><button class="primary" data-action="start" data-write>Start / resume</button><button data-action="pause" ${isCollecting()?'':'disabled'}>Pause</button>${filePicker('event-import','Import signed events')}</div><p id="collection-summary" class="stats">Loading saved progress…</p><label>Relay URLs<textarea data-setting="relays" rows="3">${escape(settings.relays)}</textarea></label><label>Selected nsite URLs <small>Optional. Leave empty to discover across your relays.</small><textarea data-setting="targets" rows="2">${escape(settings.targets)}</textarea></label><details><summary>Servers, proxy & resource limits</summary><label>Additional Blossom servers<textarea data-setting="servers" rows="3">${escape(settings.servers)}</textarea></label><label>Optional proxy URL<small>Used only after a direct fetch fails. The proxy sees requested URLs; downloaded bytes still require native hash verification.</small><input type="url" data-setting="proxy" value="${escape(settings.proxy)}"></label><div class="columns">${numeric.map(([k,l])=>`<label>${l}<input type="number" data-setting="${k}" min="1" step="1" value="${escape(settings[k])}"></label>`).join('')}</div><label><input type="checkbox" data-setting="refresh" ${settings.refresh?'checked':''}>Refresh completed relay scans</label></details><div class="actions"><button data-write data-action="index">Retry failed indexing</button></div><div id="collection-errors"></div>`;
  document.querySelectorAll('[data-setting]').forEach(el=>el.oninput=()=>{settings[el.dataset.setting]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;save('nsite.collection-settings',settings);});
  document.querySelector('[data-action="start"]').onclick=start;
  document.querySelector('[data-action="pause"]').onclick=pause;
  const data=await rpc('status');
  document.querySelector('#collection-summary').textContent=`${data.complete}/${data.jobs} files verified · ${data.gaps} scans with history gaps · ${data.quarantined} quarantined events`;
  document.querySelector('#collection-errors').innerHTML=data.errors.length?`<h2>Collection failures</h2><p class="muted">Pending jobs are saved and can be retried. Fetch failures may include CORS restrictions.</p>${data.errors.map(e=>`<div class="file-row"><small class="wrap">${escape(e.target)}</small><p>${escape(e.error)}</p></div>`).join('')}`:'';
}
mount(renderPage);
