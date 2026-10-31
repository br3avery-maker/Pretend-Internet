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
export const siteRow=s=>`<a class="row" href="${escape(route('site',{site:s.id}))}"><strong>${escape(s.title)}</strong>${s.description?`<span class="description">${escape(s.description)}</span>`:''}<small>${escape(short(s.publisher))} · ${s.publisherCount??''}${s.publisherCount?' sites · ':''}${s.versions} versions · ${s.verified}/${s.files} files verified</small></a>`;
let initialized=false;
export function initNavigation(){
 if(initialized)return;initialized=true;
 // One-time compatibility for saved links from the previous hash-based build.
 if(location.hash.startsWith('#/')){const [screen,search='']=location.hash.slice(2).split('?');if(documents[screen]){location.replace(route(screen,Object.fromEntries(new URLSearchParams(search))));return;}}
 const nav=document.querySelector('#navigation'),menu=document.querySelector('#menu');
 const close=()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');};
 menu.onclick=()=>{if(nav.classList.contains('open')){close();if(history.state?.nsiteMenu)history.back();}else{history.pushState({nsiteMenu:true},'',location.href);nav.classList.add('open');menu.setAttribute('aria-expanded','true');}};
 nav.addEventListener('click',e=>{const link=e.target.closest('a');if(!link||!history.state?.nsiteMenu)return;e.preventDefault();const target=link.href;close();window.addEventListener('popstate',()=>location.assign(target),{once:true});history.back();});
 window.addEventListener('popstate',close);window.addEventListener('pageshow',close);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){close();if(history.state?.nsiteMenu)history.back();menu.focus();}});
 const page=document.body.dataset.page,active=['site','history','compare','page'].includes(page)?'index.html':documents[page];
 for(const a of nav.querySelectorAll('a'))if(a.getAttribute('href')===active)a.setAttribute('aria-current','page');
 if('serviceWorker'in navigator&&isSecureContext)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
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
