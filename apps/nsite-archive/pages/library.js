import {icon} from '../icons.js';
import {app,escape,short,date,route,back,lastLibrary,filePicker,noData,siteRow,mount,safeGet,save} from '../ui.js';
import {rpc,operation} from '../archive-client.js';

async function renderPage(){
  const params=new URLSearchParams(location.search),refresh=true;
  sessionStorage.setItem('nsite.last-library','index.html'+location.search);
  const query=params.get('q')||'',sort=params.get('sort')||safeGet('nsite.sort','recent'),publisher=params.get('publisher')||'',limit=Number(params.get('limit'))||40;
  const hidden=params.get('hidden')==='1';
  const data=await rpc('list',{query,sort,publisher,hidden,limit,refresh,stage:'complete',stack:true});
  app.innerHTML=`<div class="topline"><h1>${publisher?'Publisher sites':'Directory'}</h1><a class="button" href="collect.html">${icon('download')}Downloads</a></div>${publisher?back('publishers.html'):''}<form id="search-form" class="toolbar"><label class="search-field">Search<input name="q" type="search" value="${escape(query)}" placeholder="Search sites, text, publishers"></label><button type="submit">${icon('search')}Search</button><label>Sort<select id="sort">${[['recent','Latest update'],['title','Title'],['files','File count'],['publisher-count','Sites per publisher']].map(([v,l])=>`<option value="${v}" ${v===sort?'selected':''}>${l}</option>`).join('')}</select></label></form><p class="stats">${data.total} ${data.total===1?'site':'sites'} ready to open${data.pending?` · <a href="collect.html">${data.pending} incomplete</a>`:''}${data.excluded?` · ${data.excluded} confirmed campaign sites excluded`:''}</p><label><input id="show-hidden" type="checkbox" ${hidden?'checked':''}>Include manually hidden sites</label>${data.rows.length?data.rows.map(siteRow).join(''):query||publisher?'<div class="empty"><strong>No matching sites.</strong><p>Try another search.</p></div>':noData}${data.total>limit?`<a class="button" href="${escape(route('library',{q:query,sort,publisher,hidden:hidden?'1':'0',limit:limit+40}))}">Show 40 more</a>`:''}`;
  const update=values=>{location.href=route('library',{q:query,sort,publisher,hidden:hidden?'1':'0',...values});};
  document.querySelector('#search-form').onsubmit=e=>{e.preventDefault();update({q:new FormData(e.target).get('q')});};
  document.querySelector('#sort').onchange=e=>{save('nsite.sort',e.target.value);update({sort:e.target.value});};
  document.querySelector('#show-hidden').onchange=e=>update({hidden:e.target.checked?'1':'0'});
}
mount(renderPage);
