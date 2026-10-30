import { bytes, signedEvent, classifyKind, normalizeURL, hex64, latest, pow, httpStatus } from './validation.mjs';
import { RelayTransport, fetchJSON, rejection } from './transport.mjs';
export { classifyKind, normalizeURL, rejection };
const nowSeconds=()=>Math.floor(Date.now()/1000);
const LIMIT_KEYS=['max_message_length','max_event_tags','max_content_length','min_pow_difficulty',
  'created_at_lower_limit','created_at_upper_limit'];
const CODE_SET=new Set(['accepted','duplicate','auth-required','auth-denied','auth-timeout','auth-mismatch','restricted',
  'payment-required','rate-limited','policy','invalid','pow','unsupported-kind','size','rejected','network','timeout',
  'connection-closed','response-limit','malformed-frame']);
const validTime=(time,now,ttl)=>Number.isSafeInteger(time)&&time>=now-ttl&&time<=now+60;
const compare=(a,b)=>{for(let i=0;i<a.rank.length;i++){const delta=b.rank[i]-a.rank[i];if(delta)return delta;}return a.url.localeCompare(b.url);};
async function parallel(items,work,concurrency=4) {
  let i=0; await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
    while(i<items.length) { const item=items[i++]; await work(item); }
  }));
}
export class Registry {
  constructor({clock=nowSeconds,allowLocal=false,maxRelays=128,metadataTTL=21600,monitorTTL=3600,observationTTL=3600}={}) {
    this.clock=clock;this.allowLocal=allowLocal;this.maxRelays=Math.min(256,Math.max(1,maxRelays));
    this.metadataTTL=metadataTTL;this.monitorTTL=monitorTTL;this.observationTTL=observationTTL;this.relays=new Map();
  }
  url(value,http=false) { return normalizeURL(value,{http,allowLocal:this.allowLocal}); }
  add(value,source='configured') {
    const url=this.url(value); let record=this.relays.get(url);
    if(!record) {
      if(this.relays.size>=this.maxRelays) return null;
      record={url,sources:new Set(),monitors:new Map(),observations:[]};this.relays.set(url,record);
    }
    record.sources.add(['configured','monitor','local-cache','discovered'].includes(source)?source:'configured');return record;
  }
  info(value,document,at=this.clock()) {
    const record=this.add(value);if(!record || !document || Array.isArray(document) || typeof document!=='object') return false;
    if(!validTime(at,this.clock(),this.metadataTTL))return false;
    const policy={};const raw=document.limitation;
    if(raw && typeof raw==='object') {
      for(const key of LIMIT_KEYS) if(Number.isSafeInteger(raw[key])&&raw[key]>=0)policy[key]=raw[key];
      for(const key of ['auth_required','payment_required','restricted_writes'])if(typeof raw[key]==='boolean')policy[key]=raw[key];
    }
    const nips=Array.isArray(document.supported_nips)?document.supported_nips.filter(x=>Number.isInteger(x)&&x>=0&&x<=65535).slice(0,256):[];
    record.info={at,policy,nips};return true;
  }
  monitor(input) {
    let e;try{e=signedEvent(input);}catch{return false;}
    if(e.kind!==30166 || !validTime(e.created_at,this.clock(),this.monitorTTL))return false;
    const d=e.tags.filter(t=>t[0]==='d');if(d.length!==1)return false;
    let record;try{record=this.add(d[0][1],'monitor');}catch{return false;}if(!record)return false;
    const previous=record.monitors.get(e.pubkey);
    if(previous&&(previous.at>e.created_at||(previous.at===e.created_at&&previous.id<=e.id)))return false;
    const kinds=[];const requirements=[];const nips=[];let rtt;
    for(const [key,value] of e.tags) {
      if(key==='k' && typeof value==='string' && /^!?\d{1,5}$/.test(value)) {
        const kind=Number(value.replace('!',''));if(kind<=65535)kinds.push({kind,accepted:!value.startsWith('!')});
      }
      if(key==='R' && /^!?(auth|payment|writes|pow)$/.test(value))requirements.push(value);
      if(key==='N'&&/^\d{1,5}$/.test(value))nips.push(Number(value));
      if(key==='rtt-write'&&/^\d{1,7}$/.test(value))rtt=Number(value);
    }
    if(!previous&&record.monitors.size>=32)return false;
    record.monitors.set(e.pubkey,{id:e.id,source:e.pubkey,at:e.created_at,kinds:kinds.slice(0,256),requirements,nips,rtt});return true;
  }
  observe(value,event,outcome,principal='anonymous') {
    if(principal!=='anonymous'&&!hex64(principal))throw Error('invalid-auth-identity');
    const r=this.add(value);if(!r)return;
    const code=CODE_SET.has(outcome.code)?outcome.code:'network';
    const at=this.clock();const row={at,eventId:event.id,kind:event.kind,author:event.pubkey,principal,
      code,accepted:outcome.accepted===true,verified:outcome.verified===true};
    r.observations=r.observations.filter(x=>validTime(x.at,at,this.observationTTL)&&!(x.eventId===row.eventId&&x.principal===principal));
    r.observations.push(row);if(r.observations.length>128)r.observations.shift();
  }
  restore(snapshot) {
    // Only restore a caller-owned local cache. This is not a network ingestion API.
    if(snapshot?.version!==1||!Array.isArray(snapshot.relays)||snapshot.relays.length>this.maxRelays)throw Error('invalid-cache');
    for(const row of snapshot.relays) {
      let r;try{r=this.add(row.url,'local-cache');}catch{continue;}if(!r)continue;
      if(row.info&&validTime(row.info.at,this.clock(),this.metadataTTL))this.info(r.url,{limitation:row.info.policy,supported_nips:row.info.nips},row.info.at);
      for(const m of Array.isArray(row.monitors)?row.monitors.slice(0,32):[]) {
        if(!hex64(m.source)||!hex64(m.id)||!validTime(m.at,this.clock(),this.monitorTTL))continue;
        const kinds=(Array.isArray(m.kinds)?m.kinds:[]).filter(k=>Number.isInteger(k.kind)&&k.kind>=0&&k.kind<=65535&&typeof k.accepted==='boolean').slice(0,256);
        r.monitors.set(m.source,{id:m.id,source:m.source,at:m.at,kinds,requirements:[],nips:[],rtt:Number.isFinite(m.rtt)&&m.rtt>=0?m.rtt:undefined});
      }
      for(const o of Array.isArray(row.observations)?row.observations.slice(-128):[]) {
        if(!validTime(o.at,this.clock(),this.observationTTL)||!hex64(o.eventId)||!hex64(o.author)||
          !(o.principal==='anonymous'||hex64(o.principal))||!Number.isInteger(o.kind)||o.kind<0||o.kind>65535||!CODE_SET.has(o.code))continue;
        r.observations.push({at:o.at,eventId:o.eventId,kind:o.kind,author:o.author,principal:o.principal,code:o.code,accepted:o.accepted===true,verified:o.verified===true&&o.accepted===true});
      }
    }
    return this;
  }
  snapshot() {
    return {version:1,at:this.clock(),relays:[...this.relays.values()].map(r=>({url:r.url,sources:[...r.sources],
      info:r.info,monitors:[...r.monitors.values()],observations:r.observations}))};
  }
}

export class RelayRouter {
  constructor({bootstrap=['wss://relay.damus.io','wss://nos.lol','wss://relay.nostr.net'],pinned=[],
    registry=new Registry(),transport=new RelayTransport(),fetch=globalThis.fetch,
    allowDestination=()=>true,clock=registry.clock,timeout=5000,maxCandidates=32}={}) {
    this.registry=registry;this.transport=transport;this.fetch=fetch;this.clock=clock;this.timeout=Math.min(30000,Math.max(100,timeout));
    this.maxCandidates=Math.min(64,Math.max(1,maxCandidates));this.allowDestination=allowDestination;
    this.bootstrap=this.urls(bootstrap);this.pinned=this.urls(pinned);this.lists=new Map();this.warnings=[];
    for(const url of [...this.pinned,...this.bootstrap])this.registry.add(url,'configured');
  }
  urls(values) {
    if(!Array.isArray(values))throw Error('destination-list-required');const urls=[];
    for(const value of values.slice(0,128)) { try { const url=this.registry.url(value);
      if(this.allowDestination(url)===true&&!urls.includes(url))urls.push(url); }catch{} }
    return urls;
  }
  validate(input,options={}) {
    const e=signedEvent(input);
    if(options.authPubkey!==undefined&&!hex64(options.authPubkey))throw Error('invalid-auth-identity');
    if(options.signAuth!==undefined&&typeof options.signAuth!=='function')throw Error('invalid-auth-signer');
    if(options.recipientLists!==undefined&&!Array.isArray(options.recipientLists))throw Error('invalid-recipient-lists');
    if(options.maxAttempts!==undefined&&(!Number.isInteger(options.maxAttempts)||options.maxAttempts<1||options.maxAttempts>64))throw Error('invalid-attempt-limit');
    if([22242,24242,27235].includes(e.kind))throw Error('transport-auth-event-not-publishable');
    if(options.visibility!==undefined&&!['public','private'].includes(options.visibility))throw Error('invalid-visibility');
    if(options.redundancy!==undefined&&(!Number.isInteger(options.redundancy)||options.redundancy<1||options.redundancy>8))throw Error('invalid-redundancy');
    if(e.tags.some(t=>t[0]==='-')&&(!options.signAuth||options.authPubkey!==e.pubkey))throw Error('protected-event-requires-author-auth');
    if(new Set(e.tags.filter(t=>t[0]==='p'&&hex64(t[1])).map(t=>t[1])).size>16)throw Error('recipient-limit-exceeded');
    if(e.kind===1059&&!options.recipientLists)throw Error('gift-wrap-requires-signed-recipient-inbox-list');
    if(options.visibility==='private'&&!this.urls(options.allowedRelays??[]).length)throw Error('private-destinations-required');
    return e;
  }
  ingestList(input) {
    let e;try{e=signedEvent(input);}catch{return false;}
    if(![10002,10050,10063].includes(e.kind)||e.created_at>this.clock()+60)return false;
    const key=`${e.kind}:${e.pubkey}`;const previous=this.lists.get(key);
    if(previous && latest([previous,e]).id!==e.id)return false;
    this.lists.set(key,e);return true;
  }
  list(pubkey,kind=10002) { return this.lists.get(`${kind}:${pubkey}`); }
  listed(e,mode) {
    if(!e)return [];
    return this.urls(e.tags.filter(t=>t[0]==='r'&&(t[2]===undefined||t[2]===''||t[2]===mode)).map(t=>t[1]));
  }
  groups(e,options={}) {
    const allowed=options.allowedRelays?new Set(this.urls(options.allowedRelays)):null;
    const filter=urls=>this.urls(urls).filter(u=>!allowed||allowed.has(u));
    if(e.kind===1059) {
      const recipients=[...new Set(e.tags.filter(t=>t[0]==='p'&&hex64(t[1])).map(t=>t[1]))];
      if(recipients.length!==1)throw Error('gift-wrap-requires-one-recipient');
      const groups=recipients.map(pubkey=>{
        const lists=[];for(const raw of options.recipientLists)try{const v=signedEvent(raw);if(v.pubkey===pubkey&&v.kind===10050)lists.push(v);}catch{}
        const list=latest(lists);if(!list)throw Error('recipient-inbox-list-invalid');
        if(list.created_at>this.clock()+60)throw Error('recipient-inbox-list-invalid');
        const urls=filter(list.tags.filter(t=>t[0]==='relay').map(t=>t[1]));
        if(!urls.length)throw Error('recipient-inbox-list-missing');return {id:`inbox:${pubkey}`,urls,preferred:urls};
      });return groups;
    }
    if(options.visibility==='private')return [{id:'private',urls:filter(options.allowedRelays),preferred:this.pinned}];
    const author=this.list(e.pubkey);const writes=this.listed(author,'write');
    const all=filter([...this.pinned,...writes,...this.bootstrap,...this.registry.relays.keys()]);
    const groups=[{id:'author',urls:all,preferred:[...this.pinned,...writes]}];
    const recipients=[...new Set(e.tags.filter(t=>t[0]==='p'&&hex64(t[1])).map(t=>t[1]))].slice(0,16);
    for(const pubkey of recipients) {
      const list=this.list(pubkey);const urls=filter(this.listed(list,'read'));
      // Explicit missing group, not a fabricated successful delivery.
      groups.push({id:`mention:${pubkey}`,urls,preferred:urls,missing:urls.length===0});
    }
    return groups;
  }
  plan(input,options={}) {
    const e=this.validate(input,options);const at=this.clock();const principal=options.authPubkey??'anonymous';
    const frameBytes=bytes(JSON.stringify(['EVENT',e]));const eventClass=classifyKind(e.kind);
    const required=options.redundancy??2;const groups=[];const excluded=[];
    for(const group of this.groups(e,options)) {
      const candidates=[];
      for(const url of group.urls.slice(0,this.maxCandidates)) {
        if(this.allowDestination(url)!==true)continue;
        const record=this.registry.relays.get(url);const reasons=[];const warnings=[];
        const info=record?.info&&validTime(record.info.at,at,this.registry.metadataTTL)?record.info:null;
        const policy=info?.policy??{};
        const observations=(record?.observations??[]).filter(x=>validTime(x.at,at,this.registry.observationTTL)&&x.principal===principal);
        const exact=observations.filter(x=>x.eventId===e.id).sort((a,b)=>b.at-a.at)[0];
        const cooldown=exact&&!exact.accepted&&at-exact.at<(exact.code==='rate-limited'?60:exact.code==='network'||exact.code==='timeout'?15:300);
        if(cooldown)reasons.push(`recent-${exact.code}`);
        if(observations.some(x=>x.code==='unsupported-kind'&&!x.accepted&&x.kind===e.kind&&x.author===e.pubkey&&at-x.at<300))reasons.push('observed-unsupported-kind');
        if(policy.max_message_length!==undefined&&frameBytes>policy.max_message_length)reasons.push('frame-size');
        if(policy.max_content_length!==undefined&&[...e.content].length>policy.max_content_length)reasons.push('content-size');
        if(policy.max_event_tags!==undefined&&e.tags.length>policy.max_event_tags)reasons.push('tag-count');
        if(policy.min_pow_difficulty!==undefined&&pow(e.id)<policy.min_pow_difficulty)reasons.push('pow');
        if(policy.auth_required===true&&!options.signAuth)reasons.push('auth-required');
        if(policy.payment_required===true&&!this.urls(options.entitledRelays??[]).includes(url))reasons.push('payment-required');
        if(policy.restricted_writes===true)warnings.push('restricted-write-policy-unverified');
        const monitors=[...(record?.monitors.values()??[])].filter(x=>validTime(x.at,at,this.registry.monitorTTL));
        const hints=monitors.flatMap(m=>m.kinds.filter(k=>k.kind===e.kind).map(k=>({source:m.source,accepted:k.accepted,id:m.id})));
        const positive=new Set(hints.filter(x=>x.accepted).map(x=>x.source)).size;
        const negative=new Set(hints.filter(x=>!x.accepted).map(x=>x.source)).size;
        if(negative)warnings.push(positive?'monitor-conflict':'monitor-reports-rejection');
        if(!info)warnings.push('metadata-unavailable-or-stale');
        const verified=observations.some(x=>x.kind===e.kind&&x.author===e.pubkey&&x.verified);
        const latencies=monitors.map(x=>x.rtt).filter(Number.isFinite).sort((a,b)=>a-b);
        const rtt=latencies.length?latencies[Math.floor(latencies.length/2)]:null;
        const row={url,confidence:verified?'previously-verified-kind':'unverified',warnings,
          evidence:{nip11At:info?.at??null,kindHints:hints,priorKindReadback:verified},
          rank:[group.preferred.includes(url)?1:0,verified?1:0,negative?0:Math.min(2,positive),info?1:0,rtt===null?-10000000:-rtt]};
        if(reasons.length)excluded.push({group:group.id,url,reasons});else candidates.push(row);
      }
      candidates.sort(compare);
      groups.push({id:group.id,required,selected:candidates.slice(0,required).map(({rank,...r})=>r),
        fallbacks:candidates.slice(required).map(({rank,...r})=>r),status:group.missing?'recipient-list-missing':candidates.length<required?'insufficient-candidates':'planned-unverified'});
    }
    return {version:1,eventId:e.id,kind:e.kind,eventClass,frameBytes,at,groups,excluded,warnings:[...this.warnings]};
  }
  async discover(input,options={}) {
    const e=this.validate(input,options);this.warnings=[];
    if(options.visibility==='private'||e.kind===1059)return this.inspect(e,options);
    const authors=[e.pubkey,...e.tags.filter(t=>t[0]==='p'&&hex64(t[1])).map(t=>t[1])];
    const seeds=this.bootstrap.slice(0,4);
    await parallel(seeds,async url=>{
      try {
        const {events,status}=await this.transport.query(url,{kinds:[10002,10063],authors:[...new Set(authors)].slice(0,17)},64);
        for(const event of events.slice(0,64))this.ingestList(event);
        if(status!=='complete')this.warnings.push({url,stage:'lists',code:'incomplete'});
      }catch{this.warnings.push({url,stage:'lists',code:'unavailable'});}
      try {
        const {events}=await this.transport.query(url,{kinds:[30166],since:this.clock()-this.registry.monitorTTL},64);
        for(const event of events.slice(0,64)) {
          const d=event?.tags?.find(t=>t[0]==='d')?.[1];
          try{if(this.allowDestination(this.registry.url(d))===true)this.registry.monitor(event);}catch{}
        }
      }catch{this.warnings.push({url,stage:'monitors',code:'unavailable'});}
    });
    for(const group of this.groups(e,options))for(const url of group.urls.slice(0,this.maxCandidates))this.registry.add(url,'discovered');
    return this.inspect(e,options);
  }
  async inspect(e,options) {
    const urls=[...new Set(this.groups(e,options).flatMap(x=>x.urls))].slice(0,this.maxCandidates);
    await parallel(urls,async url=>{
      if(this.allowDestination(url)!==true)return;
      const record=this.registry.relays.get(url);
      if(record?.info&&validTime(record.info.at,this.clock(),this.registry.metadataTTL))return;
      try { const u=new URL(url);u.protocol=u.protocol==='wss:'?'https:':'http:';
        const info=await fetchJSON(u.toString(),{fetch:this.fetch,timeout:this.timeout});this.registry.info(url,info);
      }catch{this.warnings.push({url,stage:'nip11',code:'unavailable'});}
    });
    return this.plan(e,options);
  }
  async publish(input,options={}) {
    const e=this.validate(input,options);
    const plan=await this.discover(e,options);const attempts=[];const results=[];
    const done=new Map();const maxAttempts=Math.min(64,options.maxAttempts??this.maxCandidates);let count=0;
    for(const group of plan.groups) {
      const delivered=[];const accepted=[];
      for(const destination of [...group.selected,...group.fallbacks]) {
        if(delivered.length>=group.required)break;
        const url=destination.url;
        let outcome=done.get(url);
        if(!outcome) {
          if(count++>=maxAttempts)break;
          try { outcome=await this.transport.publish(url,e,{signAuth:options.signAuth,authPubkey:options.authPubkey,readback:plan.eventClass!=='ephemeral'}); }
          catch(error) {outcome={accepted:false,verified:false,code:CODE_SET.has(error.code)?error.code:'network'};}
          // Preserve only known result fields/codes, never arbitrary relay text.
          outcome={accepted:outcome.accepted===true,verified:outcome.verified===true,
            code:CODE_SET.has(outcome.code)?outcome.code:'network',
            readback:['verified','missing','complete','limited','not-expected','auth-required','timeout','network','connection-closed'].includes(outcome.readback)?outcome.readback:'unverified'};
          done.set(url,outcome);attempts.push({url,...outcome});
          this.registry.observe(url,e,outcome,options.authPubkey??'anonymous');
        }
        if(outcome.accepted)accepted.push(url);
        if(outcome.accepted&&(outcome.verified||plan.eventClass==='ephemeral'))delivered.push(url);
      }
      results.push({id:group.id,required:group.required,accepted,delivered,
        status:delivered.length>=group.required?(plan.eventClass==='ephemeral'?'accepted-ephemeral':'verified'):accepted.length?'accepted-unverified':'not-delivered'});
    }
    const complete=results.length>0&&results.every(x=>['verified','accepted-ephemeral'].includes(x.status));
    return {version:1,eventId:e.id,kind:e.kind,eventClass:plan.eventClass,at:this.clock(),
      status:complete?(plan.eventClass==='ephemeral'?'accepted-ephemeral':'verified'):'partial-or-failed',plan,attempts,groups:results};
  }
  blossomServers(pubkey) {
    const e=this.list(pubkey,10063);if(!e)return [];
    const urls=[];for(const tag of e.tags.filter(t=>t[0]==='server'))try{
      const url=this.registry.url(tag[1],true);if(this.allowDestination(url)===true&&!urls.includes(url))urls.push(url);
    }catch{}return urls;
  }
  async preflightBlob(blob,{servers,author}={}) {
    if(!blob||!hex64(blob.sha256)||!Number.isSafeInteger(blob.size)||blob.size<0||
      typeof blob.type!=='string'||blob.type.length>256||/[\r\n]/.test(blob.type))throw Error('invalid-blob');
    const candidates=servers??this.blossomServers(author);const decisions=[];
    for(const raw of candidates.slice(0,16)) {
      let url;try{url=this.registry.url(raw,true);if(this.allowDestination(url)!==true)continue;}catch{continue;}
      try{const response=await this.fetch(url.replace(/\/$/,'')+'/upload',{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(this.timeout),
        headers:{'X-SHA-256':blob.sha256,'X-Content-Length':String(blob.size),'X-Content-Type':blob.type}});
        decisions.push({url,status:response.status,code:httpStatus(response.status),verified:false});
      }catch{decisions.push({url,code:'network',verified:false});}
    }
    return {sha256:blob.sha256,size:blob.size,type:blob.type,decisions,
      selected:decisions.filter(x=>x.code==='preflight-accepted').map(x=>x.url),
      fallbacks:decisions.filter(x=>x.code==='preflight-unsupported'||x.code==='unknown').map(x=>x.url)};
  }
}
