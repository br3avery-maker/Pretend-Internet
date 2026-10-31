import {parseHTML} from './vendor/archive-engine.js';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const blocked=new Set(['script','iframe','object','embed','base','meta','svg','math','template','noscript']);
const allowed=new Set('html head body title style div span p a img h1 h2 h3 h4 h5 h6 section article main header footer nav aside ul ol li dl dt dd pre code blockquote strong em b i u s small br hr table thead tbody tr th td figure figcaption details summary picture source video audio form label input button select option textarea'.split(' '));
const mime=p=>/\.png$/i.test(p)?'image/png':/\.jpe?g$/i.test(p)?'image/jpeg':/\.gif$/i.test(p)?'image/gif':/\.webp$/i.test(p)?'image/webp':/\.avif$/i.test(p)?'image/avif':null;
function pathFor(value,path){try{const u=new URL(value,'https://saved.invalid'+path);if(u.origin!=='https://saved.invalid')return null;return decodeURIComponent(u.pathname);}catch{return null;}}
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);}
export async function safePage(path,getFile,viewLink=()=>null){
 let missing=0;const assets=new Map();
 const asset=async(value,from)=>{const target=pathFor(value,from),type=target&&mime(target);if(!type)return '';if(assets.has(target))return assets.get(target);try{const result=`data:${type};base64,${base64(await getFile(target))}`;assets.set(target,result);return result;}catch{missing++;return '';}};
 const css=async(text,from,depth=0)=>{
  let out=String(text).replace(/<\/style/gi,'').replace(/expression\s*\([^)]*\)/gi,'');
  const imports=[...out.matchAll(/@import\s+(?:url\(\s*)?["']?([^\s"');]+)["']?\s*\)?[^;]*;/gi)];
  for(const m of imports){let replacement='';const target=pathFor(m[1],from);if(target&&depth<3)try{replacement=await css(new TextDecoder().decode(await getFile(target)),target,depth+1);}catch{missing++;}out=out.replace(m[0],replacement);}
  for(const m of [...out.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)])out=out.replace(m[0],`url("${await asset(m[1].trim(),from)}")`);
  return out;
 };
 const tree=parseHTML(new TextDecoder().decode(await getFile(path)));let nodes=0;
 async function render(n){
  if(++nodes>25000)return '';
  if(n.nodeName==='#text')return escape(n.value);
  const tag=n.tagName;if(blocked.has(tag))return '';
  if(!tag)return (await Promise.all((n.childNodes||[]).map(render))).join('');
  const attrs=Object.fromEntries((n.attrs||[]).map(a=>[a.name,a.value]));
  if(tag==='link'){if(attrs.rel==='stylesheet'){const target=pathFor(attrs.href,path);if(target)try{return '<style>'+await css(new TextDecoder().decode(await getFile(target)),target)+'</style>';}catch{missing++;}}return '';}
  if(!allowed.has(tag))return (await Promise.all((n.childNodes||[]).map(render))).join('');
  if(tag==='style')return '<style>'+await css((n.childNodes||[]).map(c=>c.value||'').join(''),path)+'</style>';
  let at='';for(const k of ['class','id','title','alt','colspan','rowspan','width','height','lang','dir'])if(attrs[k])at+=` ${k}="${escape(attrs[k])}"`;
  if(attrs.style)at+=` style="${escape(await css(attrs.style,path))}"`;
  if(tag==='img'){const src=await asset(attrs.src||'',path);if(src)at+=` src="${src}"`;}
  if(tag==='a'){const target=pathFor(attrs.href||'',path),href=target&&viewLink(target);if(href)at+=` href="${escape(href)}" target="_top"`;}
  if(['input','button','select','textarea'].includes(tag))at+=' disabled="disabled"';
  const children=(await Promise.all((n.childNodes||[]).map(render))).join('');return `<${tag}${at}>${children}</${tag}>`;
 }
 const markup=await render(tree);
 const csp="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; form-action 'none'; base-uri 'none'";
 return {html:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><style>html{overflow-wrap:anywhere}body{margin:8px}img{max-width:100%;height:auto}</style></head><body>'+markup.replace(/<\/?(?:html|head|body)(?:\s[^>]*|)>/gi,'')+'</body></html>',missing};
}
