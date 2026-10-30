(()=>{'use strict';
const NATIVE=!!(window.AndroidLauncher&&typeof window.AndroidLauncher.listApps==='function');
const $=id=>document.getElementById(id);
const extensions=['png','webp','jpg','jpeg','svg','gif','avif'];
let folder=null,entries=[],objectUrls=[],activeUrls=[],active='',openToken=0,recheckLock=false,refreshQueued=false;
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
return [...map.entries()].filter(([k,v])=>v.html).map(([k,v])=>({name:v.html.name,base:k,label:fmtName(v.html.name),html:v.html,icon:v.icon})).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));}
// ZIP directory reader for HTML-only Web2App wrappers. Reads compressed entries in memory;
// native Android handles ZIPs directly and supports full relative resources and fetch().
const ZIP_ENTRY_LIMIT=32*1024*1024;
function safeZipPath(path){return path&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(s=>!s||s==='.'||s==='..')}
async function zipIndex(file){
 const data=await file.arrayBuffer(),view=new DataView(data),entries=new Map();
 let eocd=-1;for(let i=data.byteLength-22;i>=Math.max(0,data.byteLength-65557);i--){
  if(view.getUint32(i,true)!==0x06054b50)continue;
  const commentLength=view.getUint16(i+20,true);
  const disk=view.getUint16(i+4,true),centralDisk=view.getUint16(i+6,true);
  const onDisk=view.getUint16(i+8,true),total=view.getUint16(i+10,true);
  const dirSize=view.getUint32(i+12,true),dirOffset=view.getUint32(i+16,true);
  if(i+22+commentLength!==data.byteLength||disk!==0||centralDisk!==0||onDisk!==total||dirOffset+dirSize!==i)continue;
  eocd=i;break;
 }
 if(eocd<0)throw Error('Not a supported ZIP file');
 let count=view.getUint16(eocd+10,true),pos=view.getUint32(eocd+16,true);
 if(count>4000||pos>=data.byteLength)throw Error('ZIP has too many entries or unsupported ZIP64 structure');
 const decoder=new TextDecoder('utf-8');
 for(let i=0;i<count;i++){
  if(pos+46>data.byteLength||view.getUint32(pos,true)!==0x02014b50)throw Error('Invalid ZIP directory');
  const method=view.getUint16(pos+10,true),size=view.getUint32(pos+20,true),expanded=view.getUint32(pos+24,true),length=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true);
  if(pos+46+length+extra+comment>data.byteLength)throw Error('Truncated ZIP directory');
  const name=decoder.decode(new Uint8Array(data,pos+46,length));
  if(safeZipPath(name)&&size<=ZIP_ENTRY_LIMIT&&expanded<=ZIP_ENTRY_LIMIT)entries.set(name,{name,method,size,offset});
  pos+=46+length+extra+comment;
 }
 return {buffer:data,view,entries};
}
function zipMime(name){switch(ext(name)){
 case 'html':case 'htm':return 'text/html';case 'css':return 'text/css';case 'js':case 'mjs':return 'text/javascript';case 'json':return 'application/json';case 'wasm':return 'application/wasm';
 case 'png':return 'image/png';case 'svg':return 'image/svg+xml';case 'webp':return 'image/webp';case 'jpg':case 'jpeg':return 'image/jpeg';case 'gif':return 'image/gif';case 'avif':return 'image/avif';
 case 'mp3':return 'audio/mpeg';case 'ogg':return 'audio/ogg';case 'wav':return 'audio/wav';case 'woff':return 'font/woff';case 'woff2':return 'font/woff2';default:return 'application/octet-stream';}}
async function zipRead(index,entry){
 const info=typeof entry==='string'?index.entries.get(entry):entry;if(!info)throw Error('ZIP entry not found');
 const {buffer,view}=index,pos=info.offset;
 if(pos+30>buffer.byteLength||view.getUint32(pos,true)!==0x04034b50)throw Error('Invalid ZIP file entry');
 const nameLength=view.getUint16(pos+26,true),extraLength=view.getUint16(pos+28,true);
 const start=pos+30+nameLength+extraLength,end=start+info.size;
 if(end>buffer.byteLength)throw Error('Truncated ZIP data');
 const localName=new TextDecoder('utf-8').decode(new Uint8Array(buffer,pos+30,nameLength));
 if(localName!==info.name||view.getUint16(pos+8,true)!==info.method)throw Error('ZIP local header does not match directory');
 const compressed=new Blob([buffer.slice(start,end)]);
 if(info.method===0)return new Blob([compressed],{type:zipMime(info.name)});
 if(info.method===8&&typeof DecompressionStream==='function'){
  const reader=compressed.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks=[];let total=0;
  try{
   while(true){const {done,value}=await reader.read();if(done)break;
    total+=value.byteLength;
    if(total>ZIP_ENTRY_LIMIT)throw Error('ZIP entry exceeds 32 MiB limit');
    chunks.push(value);
   }
  }catch(error){await reader.cancel().catch(()=>{});throw error}
  return new Blob(chunks,{type:zipMime(info.name)});
 }
 throw Error('ZIP compression not supported by this WebView; use the native Android launcher');
}
async function buildCatalog(files){
 const pairs=indexPairs(files),byStem=new Map(files.filter(f=>extensions.includes(ext(f.name))).map(f=>[stem(f.name),f]));
 for(const file of files){if(ext(file.name)!=='zip')continue;
  try{const index=await zipIndex(file),all=[...index.entries.keys()];
   const pages=all.filter(n=>/\.html?$/i.test(n));
   const entry=pages.find(n=>n.toLowerCase()==='index.html')||pages.filter(n=>n.toLowerCase().endsWith('/index.html')).sort((a,b)=>a.length-b.length)[0]||(pages.length===1?pages[0]:null);
   if(!entry)continue;
   const base=entry.includes('/')?entry.slice(0,entry.lastIndexOf('/')+1):'';
   const preferred=['icon','favicon','app','cover'];
   const images=all.filter(n=>n.startsWith(base)&&!n.slice(base.length).includes('/')&&extensions.includes(ext(n)));
   images.sort((a,b)=>{const rank=n=>{let k=preferred.indexOf(stem(n.slice(base.length)));return (k<0?100:k*10)+extensions.indexOf(ext(n))};return rank(a)-rank(b)});
   let icon=byStem.get(stem(file.name))||null;
   if(!icon&&images.length){const blob=await zipRead(index,images[0]);icon=new File([blob],images[0],{type:blob.type||'application/octet-stream'})}
   pairs.push({name:file.name,label:fmtName(file.name.replace(/\.zip$/i,'.html')),zip:file,index,entry,icon});
  }catch(err){console.warn('Skipped ZIP',file.name,err)}
 }
 return pairs.sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
}
function cleanupUrls(){objectUrls.forEach(URL.revokeObjectURL);objectUrls=[]}
function objectUrl(file){const url=URL.createObjectURL(file);objectUrls.push(url);return url}
function paint(){cleanupUrls();const grid=$('grid');grid.textContent='';$('empty').style.display=entries.length?'none':'block';for(const app of entries){const btn=document.createElement('button');btn.className='tile';btn.setAttribute('aria-label','Open '+app.label);const img=document.createElement('img');img.alt='';img.loading='lazy';const iconSrc=app.iconUrl||(app.icon?objectUrl(app.icon):'');if(iconSrc)img.src=iconSrc;img.onerror=()=>{img.replaceWith(Object.assign(document.createElement('div'),{className:'fallback',textContent:'◈'}))};const name=document.createElement('span');name.textContent=app.label;if(iconSrc)btn.append(img);else btn.append(Object.assign(document.createElement('div'),{className:'fallback',textContent:'◈'}));btn.append(name);btn.addEventListener('click',()=>openApp(app));grid.append(btn)}}
function status(text){$('status').textContent=text;}
function renderSource(text){$('folderLine').textContent=text;}
function openSettings(){ $('shade').classList.add('show');$('shade').setAttribute('aria-hidden','false') }
function closeSettings(){ $('shade').classList.remove('show');$('shade').setAttribute('aria-hidden','true') }
async function getPermission(h,request=false){if(!h)return false;try{let s=await h.queryPermission({mode:'read'});if(s==='granted')return true;if(request&&h.requestPermission)s=await h.requestPermission({mode:'read'});return s==='granted'}catch{return false}}
async function scanDir(){if(!folder||!(await getPermission(folder)))return false;const files=[];for await(const [,handle] of folder.entries()){if(handle.kind!=='file')continue;const file=await handle.getFile();files.push(file)}entries=await buildCatalog(files);paint();renderSource('Connected folder: '+folder.name);status(entries.length+' apps found');return true}
async function scanCache(){const records=await dbAll();entries=await buildCatalog(records.map(r=>r.file));paint();renderSource('Imported copies: '+records.length+' files');status(entries.length+' apps found in saved imports')}
async function refresh(){if(recheckLock){refreshQueued=true;return}recheckLock=true;try{if(NATIVE){const list=JSON.parse(window.AndroidLauncher.listApps());entries=list.map(x=>({name:x.id,label:x.label,iconUrl:x.iconUrl,native:true}));paint();renderSource(window.AndroidLauncher.folderName()||'No folder selected');status(entries.length+' apps found');return}if(!(await scanDir()))await scanCache()}catch(e){status('Cannot read folder: '+e.message)}finally{recheckLock=false;if(refreshQueued){refreshQueued=false;void refresh()}}}
async function chooseFolder(){if(NATIVE){window.AndroidLauncher.chooseFolder();closeSettings();return}if(typeof window.showDirectoryPicker==='function'){
try{const h=await window.showDirectoryPicker({id:'launcher-apps',mode:'read'});if(!await getPermission(h,true)){status('Folder permission not granted');return}folder=h;await dbPut('settings','folder',h);await refresh();closeSettings();return}catch(err){if(err.name==='AbortError')return;status('Folder picker unavailable here; use Import HTML/ZIP instead. ('+err.name+')');return}}
$('folderInput').click();status('Select the directory. On some Web2App wrappers, folder selection is unavailable; use Import files instead.')}
async function storeFiles(files){if(!files.length)return;let count=0;for(const f of files){if(!f.name)continue;await dbPut('files',f.name.toLowerCase(),{name:f.name,file:f});count++}await scanCache();status(count+' files saved; '+entries.length+' matching apps');closeSettings()}
// A single-file HTML app works untouched. Relative links to sibling files are rewritten
// to object URLs for images, scripts and styles when those files are in the selected folder.
async function fileList(){if(folder&&await getPermission(folder)){const out=[];for await(const [,handle] of folder.entries())if(handle.kind==='file')out.push(await handle.getFile());return out}return (await dbAll()).map(x=>x.file)}
async function makeHTML(app){
 const index=app.zip?app.index:null;
 const raw=app.zip?await (await zipRead(index,app.entry)).text():await app.html.text();
 const files=app.zip?[]:await fileList();
 const byName=new Map(files.map(f=>[f.name.toLocaleLowerCase(),f]));
 const doc=new DOMParser().parseFromString(raw,'text/html');
 const urls=[],base=app.zip?(app.entry.includes('/')?app.entry.slice(0,app.entry.lastIndexOf('/')+1):''):'';
 async function convert(url,dir=base){
  if(!url||/^(#|data:|blob:|https?:|mailto:|tel:|\/\/)/i.test(url)||url.startsWith('/'))return url;
  let u;try{u=decodeURIComponent(url.split(/[?#]/)[0])}catch{return url}
  let path;try{path=new URL(u,'https://local.invalid/'+dir).pathname.slice(1)}catch{return url}
  if(!safeZipPath(path))return url;
  let blob;
  if(index&&index.entries.has(path))blob=await zipRead(index,path);
  else if(!index&&byName.has(path.toLocaleLowerCase()))blob=byName.get(path.toLocaleLowerCase());
  if(!blob)return url;
  // CSS needs its own relative resource URLs rewritten before wrapping in a Blob.
  if(ext(path)==='css'){
   let css=await blob.text(),cssdir=path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):'';
   css=await rewriteCSS(css,cssdir);
   blob=new Blob([css],{type:'text/css'});
  }
  if(ext(path)==='js'||ext(path)==='mjs')blob=new Blob([await blob.text()],{type:'text/javascript'});
  const href=URL.createObjectURL(blob);urls.push(href);return href;
 }
 async function rewriteCSS(css,dir){
  const matcher=/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi;
  const matches=[...css.matchAll(matcher)];
  for(const m of matches){const converted=await convert(m[2],dir);css=css.replace(m[0],'url('+JSON.stringify(converted)+')')}
  return css;
 }
 for(const elem of doc.querySelectorAll('[src],[href],[poster]')){
  for(const attr of ['src','href','poster'])if(elem.hasAttribute(attr))elem.setAttribute(attr,await convert(elem.getAttribute(attr)));
 }
 for(const elem of doc.querySelectorAll('style,[style]')){
  if(elem.tagName==='STYLE')elem.textContent=await rewriteCSS(elem.textContent,base);
  else if(elem.hasAttribute('style'))elem.setAttribute('style',await rewriteCSS(elem.getAttribute('style'),base));
 }
 return {html:'<!doctype html>\n'+doc.documentElement.outerHTML,urls};
}
function releaseActiveUrls(){activeUrls.forEach(u=>URL.revokeObjectURL(u));activeUrls=[]}
async function openApp(app){closeSettings();const token=++openToken;releaseActiveUrls();active=app.name;$('player').classList.add('active');$('gear').style.display='none';if(!location.hash.startsWith('#/app/'))history.pushState({app:app.name},'', '#/app/'+encodeURIComponent(app.name));if(app.native){window.AndroidLauncher.launchApp(app.name);$('player').classList.remove('active');return}
try{const v=await makeHTML(app);if(token!==openToken){v.urls.forEach(u=>URL.revokeObjectURL(u));return}activeUrls=v.urls;$('appframe').srcdoc=v.html;}catch(err){if(token===openToken){status('Could not open app: '+err.message);returnHome(true)}}}
function returnHome(goBack=true){++openToken;releaseActiveUrls();active='';$('player').classList.remove('active');$('appframe').removeAttribute('srcdoc');$('appframe').src='about:blank';$('gear').style.display='grid';if(goBack&&location.hash.startsWith('#/app/'))history.back()}
window.addEventListener('popstate',()=>{if(active)returnHome(false)});
window.addEventListener('focus',()=>{if(!active)refresh()});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!active)refresh()});
window.onNativeCatalogChanged=()=>refresh();window.onNativeAppReturned=()=>{returnHome(true);refresh()};$('gear').onclick=openSettings;$('dismiss').onclick=closeSettings;$('shade').onclick=e=>{if(e.target===$('shade'))closeSettings()};$('scan').onclick=refresh;$('choose').onclick=chooseFolder;$('back').onclick=()=>returnHome();
$('import').onclick=()=>{status('Select HTML, optional matching images, or ZIP apps.');$('filesInput').click()};$('clear').onclick=async()=>{await dbClear('files');await refresh();status('Imported copies cleared')};
$('folderInput').onchange=async e=>{await storeFiles([...e.target.files]);e.target.value=''};$('filesInput').onchange=async e=>{await storeFiles([...e.target.files]);e.target.value=''};
(async()=>{if(!NATIVE){try{folder=await dbGet('settings','folder')}catch{folder=null}}await refresh()})().catch(e=>status(e.message));
})();
