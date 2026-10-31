import {app,escape,short,date,route,back,lastLibrary,filePicker,noData,siteRow,mount} from '../ui.js';
import {rpc,operation} from '../archive-client.js';

async function renderPage(){
  const params=new URLSearchParams(location.search),refresh=true;
  const id=params.get('site'),data=await rpc('detail',{site:id});
  const limit=Number(params.get('limit'))||40;
  app.innerHTML=`${back(route('site',{site:id}))}<h1>Version history</h1><p>${escape(data.summary.title)}</p>${data.history.length>1?`<form id="compare-form"><div class="columns"><label>Older version<select name="before">${data.history.slice(1).map(v=>`<option value="${v.id}">${escape(date(v.created))} · ${short(v.id)}</option>`).join('')}</select></label><label>Newer version<select name="after">${data.history.map(v=>`<option value="${v.id}">${escape(date(v.created))} · ${short(v.id)}</option>`).join('')}</select></label></div><button class="primary">Compare versions</button></form>`:''}${data.history.slice(0,limit).map(v=>`<a class="row" href="${escape(route('site',{site:id,version:v.id}))}"><strong>${date(v.created)}</strong><small>${escape(v.id)}${v.legacy?' · legacy observation':''}</small></a>`).join('')}${data.history.length>limit?`<a class="button" href="${escape(route('history',{site:id,limit:limit+40}))}">Show earlier versions</a>`:''}`;
  document.querySelector('#compare-form')?.addEventListener('submit',e=>{e.preventDefault();const form=new FormData(e.target);location.href=route('compare',{site:id,before:form.get('before'),after:form.get('after')});});
}
mount(renderPage);
