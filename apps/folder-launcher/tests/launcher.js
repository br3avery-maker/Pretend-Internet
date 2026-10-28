
(()=>{'use strict';
const NATIVE=!!(window.AndroidLauncher&&typeof window.AndroidLauncher.listApps==='function');
const $=id=>document.getElementById(id);
const extensions=['png','webp','jpg','jpeg','svg','gif','avif'];
let folder=null,entries=[],objectUrls=[],active='',recheckLock=false;
const dbName='folder-launcher-v1';
function storage(){return new Promise((resolve,reject)=>{const req=indexedDB.open(dbName,1);req.onupgradeneeded=()=>{const d=req.result;d.createObjectStore('settings');d.createObjectStore('files')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function dbGet(store,key){const d=await storage();return new Promise((res,rej)=>{const t=d.transaction(store,'readonly'),q=t.objectStore(store).get(key);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);t.oncomplete=()=>d.close()})}
async function dbPut(store,key,value){const d=await storage();return new Promise((res,rej)=>{const t=d.transaction(store,'readwrite');t.objectStore(store).put(value,key);t.oncomplete=()=>{d.close();res()};t.onerror=()=>rej(t.error)})}
async function dbClear(store){const d=await storage();return new Promise((res,rej)=>{const t=d.transaction(store,'readwrite');t.objectStore(store).clear();t.oncomplete=()=>{d.close();res()};t.onerror=()=>rej(t.error)})}
async function dbAll(){const d=await storage();return new Promise((res,rej)=>{const t=d.transaction('files','readonly'),q=t.objectStore('files').getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);t.oncomplete=()=>d.close()})}
function fmtName(name){return name.replace(/\.html?$/i,'').replace(/[_-]+/g,' ').trim()}
function ext(n){return (n.match(/\.([^.]+)$/)||[])[1]?.toLowerCase()||''}
function stem(n){return n.replace(/\.[^.]*$/,'').toLocaleLowerCase()}
function indexPairs(files){const map=new Map();for(const file of files){let n=file.name;if(!n||n.startsWith('.'))continue;const key=stem(n);if(!map.has(key))map.set(key,{});const r=map.get(key);const e=ext(n);if(e==='html'||e==='htm')r.html=file;else if(extensions.includes(e)&&(!r.icon||extensions.indexOf(e)<extensions.indexOf(ext(r.icon.name))))r.icon=file}
return [...map.entries()].filter(([k,v])=>v.html&&v.icon).map(([k,v])=>({name:v.html.name,base:k,label:fmtName(v.html.name),html:v.html,icon:v.icon})).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));}
function cleanupUrls(){objectUrls.forEach(URL.revokeObjectURL);objectUrls=[]}
function objectUrl(file){const url=URL.createObjectURL(file);objectUrls.push(url);return url}
function paint(){cleanupUrls();const grid=$('grid');grid.textContent='';$('empty').style.display=entries.length?'none':'block';for(const app of entries){const btn=document.createElement('button');btn.className='tile';btn.setAttribute('aria-label','Open '+app.label);const img=document.createElement('img');img.alt='';img.loading='lazy';img.src=app.iconUrl||(app.icon?objectUrl(app.icon):'');img.onerror=()=>{img.replaceWith(Object.assign(document.createElement('div'),{className:'fallback',textContent:'◈'}))};const name=document.createElement('span');name.textContent=app.label;btn.append(img,name);btn.addEventListener('click',()=>openApp(app));grid.append(btn)}}
function status(text){$('status').textContent=text;}
function renderSource(text){$('folderLine').textContent=text;}
function openSettings(){ $('shade').classList.add('show');$('shade').setAttribute('aria-hidden','false') }
function closeSettings(){ $('shade').classList.remove('show');$('shade').setAttribute('aria-hidden','true') }
async function getPermission(h,request=false){if(!h)return false;try{let s=await h.queryPermission({mode:'read'});if(s==='granted')return true;if(request&&h.requestPermission)s=await h.requestPermission({mode:'read'});return s==='granted'}catch{return false}}
async function scanDir(){if(!folder||!(await getPermission(folder)))return false;const files=[];for await(const [,handle] of folder.entries()){if(handle.kind!=='file')continue;const file=await handle.getFile();files.push(file)}entries=indexPairs(files);paint();renderSource('Connected folder: '+folder.name);status(entries.length+' apps found');return true}
async function scanCache(){const records=await dbAll();entries=indexPairs(records.map(r=>r.file));paint();renderSource('Imported copies: '+records.length+' files');status(entries.length+' apps found in saved imports')}
async function refresh(){if(recheckLock)return;recheckLock=true;try{if(NATIVE){const list=JSON.parse(window.AndroidLauncher.listApps());entries=list.map(x=>({name:x.html,label:x.label,iconUrl:x.iconUrl,native:true}));paint();renderSource(window.AndroidLauncher.folderName()||'No folder selected');status(entries.length+' apps found');return}if(!(await scanDir()))await scanCache()}catch(e){status('Cannot read folder: '+e.message)}finally{recheckLock=false}}
async function chooseFolder(){if(NATIVE){window.AndroidLauncher.chooseFolder();closeSettings();return}if(typeof window.showDirectoryPicker==='function'){
try{const h=await window.showDirectoryPicker({id:'launcher-apps',mode:'read'});if(!await getPermission(h,true)){status('Folder permission not granted');return}folder=h;await dbPut('settings','folder',h);await refresh();closeSettings();return}catch(err){if(err.name==='AbortError')return;status('Folder picker unavailable here; use Import HTML + images instead. ('+err.name+')');return}}
$('folderInput').click();status('Select the directory. On some Web2App wrappers, folder selection is unavailable; use Import files instead.')}
async function storeFiles(files){if(!files.length)return;let count=0;for(const f of files){if(!f.name)continue;await dbPut('files',f.name.toLowerCase(),{name:f.name,file:f});count++}await scanCache();status(count+' files saved; '+entries.length+' matching apps');closeSettings()}
// A single-file HTML app works untouched. Relative links to sibling files are rewritten
// to object URLs for images, scripts and styles when those files are in the selected folder.
async function fileList(){if(folder&&await getPermission(folder)){const out=[];for await(const [,handle] of folder.entries())if(handle.kind==='file')out.push(await handle.getFile());return out}return (await dbAll()).map(x=>x.file)}
async function makeHTML(app){const raw=await app.html.text(),files=await fileList();const byName=new Map(files.map(f=>[f.name.toLocaleLowerCase(),f]));const doc=new DOMParser().parseFromString(raw,'text/html');const urls=[];
function convert(url){if(!url||/^(#|data:|blob:|https?:|mailto:|tel:|\/\/)/i.test(url)||url.startsWith('/'))return url;let u;try{u=decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\.\//,'')}catch{return url}if(u.includes('..')||u.includes('/'))return url;const f=byName.get(u.toLowerCase());if(!f)return url;const blob=URL.createObjectURL(f);urls.push(blob);return blob}
for(const elem of doc.querySelectorAll('[src],[href],[poster]')){for(const attr of ['src','href','poster'])if(elem.hasAttribute(attr))elem.setAttribute(attr,convert(elem.getAttribute(attr)))}
for(const elem of doc.querySelectorAll('style,[style]')){const rewrite=s=>s.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi,(_,q,url)=>'url('+JSON.stringify(convert(url))+')');if(elem.tagName==='STYLE')elem.textContent=rewrite(elem.textContent);else if(elem.hasAttribute('style'))elem.setAttribute('style',rewrite(elem.getAttribute('style')))}
const html='<!doctype html>\n'+doc.documentElement.outerHTML;return {html,urls};}
async function openApp(app){closeSettings();active=app.name;$('player').classList.add('active');$('gear').style.display='none';if(!location.hash.startsWith('#/app/'))history.pushState({app:app.name},'', '#/app/'+encodeURIComponent(app.name));if(app.native){window.AndroidLauncher.launchApp(app.name);$('player').classList.remove('active');return}
try{const v=await makeHTML(app);v.urls.forEach(u=>objectUrls.push(u));$('appframe').srcdoc=v.html;}catch(err){status('Could not open app: '+err.message);returnHome(false)}}
function returnHome(goBack=true){active='';$('player').classList.remove('active');$('appframe').removeAttribute('srcdoc');$('appframe').src='about:blank';$('gear').style.display='grid';if(goBack&&location.hash.startsWith('#/app/'))history.back()}
window.addEventListener('popstate',()=>{if(active)returnHome(false)});
window.addEventListener('focus',()=>{if(!active)refresh()});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!active)refresh()});
window.onNativeCatalogChanged=()=>refresh();window.onNativeAppReturned=()=>{returnHome(true);refresh()};$('gear').onclick=openSettings;$('dismiss').onclick=closeSettings;$('shade').onclick=e=>{if(e.target===$('shade'))closeSettings()};$('scan').onclick=refresh;$('choose').onclick=chooseFolder;$('back').onclick=()=>returnHome();
$('import').onclick=()=>{status('Select your HTML and matching images together.');$('filesInput').click()};$('clear').onclick=async()=>{await dbClear('files');await refresh();status('Imported copies cleared')};
$('folderInput').onchange=async e=>{await storeFiles([...e.target.files]);e.target.value=''};$('filesInput').onchange=async e=>{await storeFiles([...e.target.files]);e.target.value=''};
(async()=>{if(!NATIVE){try{folder=await dbGet('settings','folder')}catch{folder=null}}await refresh()})().catch(e=>status(e.message));
})();
