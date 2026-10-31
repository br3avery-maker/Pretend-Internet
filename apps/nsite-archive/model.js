import { campaignPrefix, aggregate } from './vendor/archive-engine.js';

export const newest = (a,b) => b.event.created_at-a.event.created_at || a.id.localeCompare(b.id);
const key = f => `${f.hash}\n${f.path}`;

// Build indexes once per refresh. Never reconstruct every legacy snapshot or
// run all-pairs relationship comparisons when listing the library.
export function buildCatalog(records, pages, jobs, settings) {
  const bySite = new Map(), pageMap = new Map(), jobMap = new Map(jobs.map(j=>[j.id,j]));
  const settingMap = new Map(settings.map(s=>[s.id,s]));
  for (const page of pages) pageMap.set(key(page),page);
  for (const record of records) {
    if (!bySite.has(record.site)) bySite.set(record.site,[]);
    bySite.get(record.site).push(record);
  }
  const sites=[], latestBySite=new Map();
  for (const [id, versions] of bySite) {
    versions.sort(newest);
    const latest = materialize(versions,versions[0].id);
    latestBySite.set(id,latest);
    const derived=latest.files.map(f=>pageMap.get(key(f))).filter(Boolean);
    let excluded=Boolean(settingMap.get('spam-observed:'+id)?.prefix);
    for (const v of versions) {
      if(campaignPrefix(v.published?.description)) { excluded=true; break; }
      if(v.files.some(f=>campaignPrefix(pageMap.get(key(f))?.data?.description))) { excluded=true; break; }
    }
    const title=latest.published?.title || derived.find(p=>p.data?.title)?.data.title || 'Untitled site';
    const description=latest.published?.description || derived.find(p=>p.data?.description)?.data.description || '';
    sites.push({ id,publisher:latest.event.pubkey,title,description,
      created:latest.event.created_at,versions:versions.length,files:latest.files.length,nativeHash:latest.nativeHash,
      verified:latest.files.filter(f=>jobMap.get(f.hash)?.state==='complete').length,
      hidden:Boolean(settingMap.get('hidden:'+id)?.hidden),excluded,
      search:[id,latest.event.pubkey,...versions.flatMap(v=>[v.published?.title,v.published?.description]),
        ...derived.flatMap(p=>[p.data?.title,p.data?.description,p.data?.text])].filter(Boolean).join(' ').toLowerCase(),
    });
  }
  return {sites,bySite,pageMap,jobMap,settingMap,latestBySite};
}

export function materialize(versions,id) {
  const target=versions.find(v=>v.id===id);
  if(!target) throw Error('Version not found.');
  if(!target.legacy) return target;
  const ordered=versions.slice().sort((a,b)=>a.event.created_at-b.event.created_at || b.id.localeCompare(a.id));
  const files=new Map(),events=[];
  for(const v of ordered) {
    for(const f of v.files) files.set(f.path,{...f,event:v.id});
    events.push(v.id);
    if(v.id===id) break;
  }
  const tree=[...files.values()].sort((a,b)=>a.path.localeCompare(b.path));
  return {...target,files:tree,eventIds:events,nativeHash:aggregate(tree),coverage:'legacy-observed-tree'};
}

export function listCatalog(catalog,{query='',sort='recent',publisher='',hidden=false,offset=0,limit=40}={}) {
  const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible=catalog.sites.filter(s=>!s.excluded && (hidden||!s.hidden));
  const counts=new Map();
  for(const s of visible) counts.set(s.publisher,(counts.get(s.publisher)||0)+1);
  const results=visible.filter(s=>(!publisher||s.publisher===publisher)&&words.every(w=>s.search.includes(w)));
  results.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='files'?b.files-a.files:
    sort==='publisher-count'?(counts.get(b.publisher)-counts.get(a.publisher)||a.publisher.localeCompare(b.publisher)||a.title.localeCompare(b.title)):
    b.created-a.created||a.id.localeCompare(b.id));
  const publishers=[...counts].map(([id,count])=>({id,count})).sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
  return {total:results.length,excluded:catalog.sites.filter(s=>s.excluded).length,publishers,
    rows:results.slice(offset,offset+limit).map(({search,...s})=>({...s,publisherCount:counts.get(s.publisher)}))};
}

export function diffFiles(before,after,blobs=new Map()) {
  const a=new Map(before.files.map(f=>[f.path,f.hash])), b=new Map(after.files.map(f=>[f.path,f.hash]));
  const changes=[];
  for(const path of [...new Set([...a.keys(),...b.keys()])].sort()) {
    const old=a.get(path),next=b.get(path);
    if(old===next) continue;
    const x=blobs.get(old),y=blobs.get(next),set=new Set(x?.parts.map(p=>p.hash)||[]);
    changes.push({path,status:!old?'added':!next?'removed':'changed',
      reusedBytes:x&&y?y.parts.filter(p=>set.has(p.hash)).reduce((n,p)=>n+p.size,0):null});
  }
  return changes;
}
