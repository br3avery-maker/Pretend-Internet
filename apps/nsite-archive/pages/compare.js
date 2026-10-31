import {app,escape,short,date,route,back,lastLibrary,filePicker,noData,siteRow,mount} from '../ui.js';
import {rpc,operation} from '../archive-client.js';

async function renderPage(){
  const params=new URLSearchParams(location.search),refresh=true;
  const changes=await rpc('compare',Object.fromEntries(params));
  app.innerHTML=`${back(route('history',{site:params.get('site')}))}<h1>Version comparison</h1><p>${changes.length} changed paths</p>${changes.map(c=>`<div class="file-row"><span class="badge">${escape(c.status)}</span><strong class="wrap"> ${escape(c.path)}</strong>${c.status==='changed'?`<p class="muted">${c.reusedBytes===null?'Collect both versions for chunk comparison.':c.reusedBytes+' unchanged chunk bytes reused.'}</p>`:''}</div>`).join('')||'<p>These versions contain the same files.</p>'}`;
}
mount(renderPage);
