import {extractPage,readBlob,extractor,campaignPrefix} from './vendor/archive-engine.js';
export function describe(bytes,path){
 if(bytes.length>4194304)throw Error('Page exceeds the 4 MiB phone indexing limit; original bytes are saved.');
 const data=/\.txt$/i.test(path)?{title:'',description:'',text:new TextDecoder().decode(bytes).slice(0,1048576),headings:[],links:[],subjects:[]}:extractPage(bytes,path);
 const text=(data.text||'').replace(/\s+/g,' ').trim();
 data.publishedTitle=data.title;data.publishedDescription=data.description;
 data.title=(data.title||data.headings?.find(Boolean)||text.slice(0,80)||path).slice(0,240);
 data.description=data.description||text.slice(0,280);
 data.titleBasis=data.publishedTitle?'html-title':data.headings?.length?'page-heading':'page-text';
 data.descriptionBasis=data.publishedDescription?'page-metadata':'page-text-excerpt';
 return data;
}
export async function indexArchive(db,{site,hash,retry=false,signal,onProgress=()=>{}}={}){
 let indexed=0;const failures=[],seen=new Set(),complete=new Set((await db.getAll('jobs')).filter(j=>j.state==='complete').map(j=>j.id));
 for(const v of await db.getAll('versions')){
  if(site&&v.site!==site)continue;
  for(const f of v.files){
   if(signal?.aborted)return {indexed,failures,paused:true};
   if(!complete.has(f.hash)||hash&&f.hash!==hash||! /\.(html?|txt)$/i.test(f.path))continue;
   const id=`${f.hash}\n${f.path}\n${extractor}`;if(seen.has(id))continue;seen.add(id);
   if(!retry&&((await db.get('pages',id))?.data?.titleBasis||await db.get('index-failures',id)))continue;
   try{const data=describe(await readBlob(db,f.hash),f.path);const prefix=campaignPrefix(data.publishedDescription||data.description)||campaignPrefix(v.published?.description);if(prefix)await db.put('settings',{id:'spam-observed:'+v.site,prefix,path:f.path,hash:f.hash});await db.put('pages',{id,hash:f.hash,path:f.path,data,extractor});await db.delete('index-failures',id);indexed++;onProgress({phase:'index',site:v.site,path:f.path,indexed});}
   catch(e){if(e.message==='missing-blob')continue;if(e.name==='QuotaExceededError')throw e;const failure={id,hash:f.hash,path:f.path,error:e.message};failures.push(failure);await db.put('index-failures',failure);}
   await new Promise(r=>setTimeout(r,0));
  }
 }
 return {indexed,failures};
}
