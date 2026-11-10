import {app,escape,short,date,route,back,lastLibrary,filePicker,noData,siteRow,mount} from '../ui.js';
import {rpc,operation} from '../archive-client.js';

async function renderPage(){
  const params=new URLSearchParams(location.search),refresh=true;
  const data=await rpc('list',{refresh,limit:0,stage:'complete'});
  const limit=Number(params.get('limit'))||40;
  app.innerHTML=`<h1>Publishers</h1><p class="stats">${data.publishers.length} publishers · sorted by site count</p>${data.publishers.slice(0,limit).map(p=>`<a class="row" href="${escape(route('library',{publisher:p.id}))}"><strong>${p.count} ${p.count===1?'site':'sites'}</strong><small>${escape(p.id)}</small></a>`).join('')||noData}${data.publishers.length>limit?`<a class="button" href="${escape(route('publishers',{limit:limit+40}))}">Show more publishers</a>`:''}`;
}
mount(renderPage);
