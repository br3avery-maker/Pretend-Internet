import {app,escape,short,date,route,back,lastLibrary,filePicker,noData,siteRow,mount} from '../ui.js';
import {rpc,operation} from '../archive-client.js';

async function renderPage(){
  const params=new URLSearchParams(location.search),refresh=true;
  const data=await rpc('detail',{site:params.get('site'),version:params.get('version')});
  const f=data.files.find(f=>f.path===params.get('path'));if(!f?.page)throw Error('This page has not been indexed. Collect the file or retry indexing.');
  app.innerHTML=`${back(route('site',{site:params.get('site'),version:data.version.id}))}<article><h1>${escape(f.page.title||f.path)}</h1><p class="muted wrap">${escape(f.path)} · text from verified archived bytes</p><div class="page-text">${escape(f.page.text)}</div></article>${f.page.resources?.length?`<details><summary>Referenced resources</summary><ul>${f.page.resources.map(r=>`<li>${escape(r.url)} · ${r.external?'external; not collected':data.version.files.some(f=>{try{return decodeURIComponent(f.path)===decodeURIComponent(r.url);}catch{return false;}})?'declared in manifest':'not declared in manifest'}</li>`).join('')}</ul></details>`:''}`;
}
mount(renderPage);
