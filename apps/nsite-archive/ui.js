import {icon} from './icons.js';
import {initCollection} from './collection.js';
import {startPreviews} from './previews.js';
export const app=document.querySelector('#app');
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const short=value=>value.length>28?value.slice(0,14)+'…'+value.slice(-8):value;
export const date=value=>new Date(value*1000).toLocaleString();
export const documents=Object.freeze({library:'index.html',publishers:'publishers.html',site:'site.html',history:'history.html',compare:'compare.html',page:'page.html',collect:'collect.html',backup:'backup.html',help:'help.html'});
export const route=(screen,values={})=>documents[screen]+(Object.keys(values).length?'?'+new URLSearchParams(values):'');
export function lastLibrary(){
 const saved=sessionStorage.getItem('nsite.last-library');
 if(!saved)return 'index.html';
 if(saved.startsWith('#/library'))return 'index.html'+(saved.includes('?')?'?'+saved.split('?')[1]:'');
 try{const url=new URL(saved,location.href);if(url.origin===location.origin&&url.pathname.endsWith('/index.html'))return 'index.html'+url.search;}catch{}
 return 'index.html';
}
export const back=(href='index.html')=>`<a class="back" href="${escape(href)}">‹ Back</a>`;
export const filePicker=(id,label)=>`<label class="button"><span>${label}</span><input class="file-input" id="${id}" type="file" accept=".json,.ndjson,application/json" data-write></label>`;
export const noData='<div class="empty"><strong>Your library is empty.</strong><p>Collect publications from relays or import signed events. Saved sites will appear here.</p><a class="button primary" href="collect.html">Collect sites</a></div>';
export const siteRow=s=>`<article class="site-entry"><a class="site-preview" href="${escape(route('site',{site:s.id}))}" aria-label="Open ${escape(s.title)}"><img data-preview-hash="${escape(s.nativeHash)}" ${s.preview?`src="${s.preview}"`:''} alt="${s.preview?'Screenshot of archived '+escape(s.title):'Preview being prepared'}" ${s.preview?'':'hidden'}><span class="preview-placeholder" ${s.preview?'hidden':''}>${icon('image')}Archived page preview</span></a><div class="site-info"><a href="${escape(route('site',{site:s.id}))}"><h2>${escape(s.title)}</h2></a><p>${escape(s.description||'Saved publication. Open to explore its pages.')}</p><details><summary>${icon('people')}${s.publishers?.length||1} publisher${s.publishers?.length>1?'s':''} · ${s.versions} version${s.versions===1?'':'s'}${s.members?.length>1?' · '+s.members.length+' publications':''}</summary>${(s.members||[{id:s.id,publisher:s.publisher,versions:s.versions}]).map(m=>`<a class="row" href="${escape(route('site',{site:m.id}))}"><span class="wrap">${escape(short(m.publisher))}</span><small>${m.versions} versions · ${escape(m.id.split(':').slice(2).join(':')||'root site')}</small></a>`).join('')}</details><div class="subjects">${(s.subjects||[]).slice(0,5).map(t=>`<a href="index.html?q=${encodeURIComponent(t)}">${escape(t)}</a>`).join(' ')}</div><a class="button primary" href="view.html?site=${encodeURIComponent(s.id)}">${icon('read')}Open saved site</a></div></article>`;

let initialized=false;
export function initNavigation(){
 if(initialized)return;initialized=true;
 // One-time compatibility for saved links from the previous hash-based build.
 if(location.hash.startsWith('#/')){const [screen,search='']=location.hash.slice(2).split('?');if(documents[screen]){location.replace(route(screen,Object.fromEntries(new URLSearchParams(search))));return;}}
 const nav=document.querySelector('#navigation'),menu=document.querySelector('#menu');
 menu.innerHTML=icon('menu');const labels={'index.html':'library','publishers.html':'people','collect.html':'download','backup.html':'storage','help.html':'help'};for(const a of nav.querySelectorAll('a')){a.innerHTML=icon(labels[a.getAttribute('href')])+a.textContent;if(a.getAttribute('href')==='collect.html')a.lastChild.textContent='Downloads';}
 initCollection().catch(()=>{});startPreviews();
 const close=()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');};
 menu.onclick=()=>{if(nav.classList.contains('open')){close();if(history.state?.nsiteMenu)history.back();}else{history.pushState({nsiteMenu:true},'',location.href);nav.classList.add('open');menu.setAttribute('aria-expanded','true');}};
 nav.addEventListener('click',e=>{const link=e.target.closest('a');if(!link||!history.state?.nsiteMenu)return;e.preventDefault();const target=link.href;close();window.addEventListener('popstate',()=>location.assign(target),{once:true});history.back();});
 window.addEventListener('popstate',close);window.addEventListener('pageshow',close);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){close();if(history.state?.nsiteMenu)history.back();menu.focus();}});
 const page=document.body.dataset.page,active=['site','history','compare','page'].includes(page)?'index.html':documents[page];
 for(const a of nav.querySelectorAll('a'))if(a.getAttribute('href')===active)a.setAttribute('aria-current','page');
 if('serviceWorker'in navigator&&isSecureContext)navigator.serviceWorker.register('./sw.js',{scope:'./',type:'module'}).catch(()=>{});
}
export function mount(loadPage){
 initNavigation();const scrollKey='nsite.scroll:'+location.pathname+location.search;let first=true;
 const load=async()=>{const y=first?Number(sessionStorage.getItem(scrollKey)||0):window.scrollY;try{await loadPage();window.dispatchEvent(new Event('pagecontent'));if(first){app.focus({preventScroll:true});first=false;}window.scrollTo(0,y);}catch(error){document.querySelector('#activity-message').textContent=error.message;const old=document.querySelector('#page-error');old?.remove();const box=document.createElement('p');box.id='page-error';box.className='error';box.textContent=error.message;app.prepend(box);}};
 window.addEventListener('archivechange',load);
 window.addEventListener('pageshow',e=>{if(e.persisted)load();});
 window.addEventListener('pagehide',()=>sessionStorage.setItem(scrollKey,String(window.scrollY)));
 load();
}

export const safeGet=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
export const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{document.querySelector('#activity-message').textContent='Preferences could not be saved; archive data is unchanged.';}};
