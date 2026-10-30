import { signedEvent } from './validation.mjs';
import { matchFilter } from 'nostr-tools/filter';

export class RelayFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function rejection(reason) {
  const prefix = typeof reason === 'string' ? reason.split(':', 1)[0].toLowerCase() : '';
  return ({ 'auth-required':'auth-required', restricted:'restricted', 'payment-required':'payment-required',
    'rate-limited':'rate-limited', blocked:'policy', invalid:'invalid', pow:'pow', duplicate:'duplicate',
    'unsupported-kind':'unsupported-kind', 'event-too-large':'size' })[prefix] ?? 'rejected';
}
export async function bounded(promise, milliseconds, code = 'timeout') {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new RelayFailure(code)), milliseconds);
  })]); } finally { clearTimeout(timer); }
}

// A finite protocol session. Reuse nostr-tools verification/filter primitives;
// keep strict frame validation, AUTH refusal and resource limits at our boundary.
class Session {
  constructor(url, { WebSocket: WS = globalThis.WebSocket, timeout = 5000, maxBytes = 2097152 } = {}) {
    this.url=url; this.timeout=timeout; this.queue=[]; this.waiters=[]; this.bytes=0; this.frames=0;
    this.socket=new WS(url); this.failure=null;
    this.socket.addEventListener('message', message => {
      if (typeof message.data !== 'string') return this.fail('malformed-frame');
      this.bytes += new TextEncoder().encode(message.data).length;
      if (this.bytes > maxBytes || ++this.frames > 1024) return this.fail('response-limit');
      let m; try { m=JSON.parse(message.data); } catch { return this.fail('malformed-frame'); }
      if (!Array.isArray(m) || typeof m[0] !== 'string') return;
      if (m[0]==='AUTH') {
        if (typeof m[1]==='string' && m[1].length<=1024) this.challenge=m[1];
        return;
      }
      if (m[0]==='OK' && (typeof m[1]!=='string' || typeof m[2]!=='boolean' || typeof m[3]!=='string')) return;
      const waiter=this.waiters.find(x=>x.matches(m));
      if (waiter) { this.waiters.splice(this.waiters.indexOf(waiter),1); waiter.resolve(m); }
      else if (this.queue.length<128) this.queue.push(m);
    });
    this.socket.addEventListener('close',()=>this.fail('connection-closed'));
    this.socket.addEventListener('error',()=>this.fail('network'));
  }
  fail(code) {
    this.failure ??= new RelayFailure(code);
    for(const w of this.waiters.splice(0)) w.reject(this.failure);
    this.close();
  }
  async connect() {
    if(this.socket.readyState===1) return;
    await bounded(new Promise((resolve,reject)=>{
      this.socket.addEventListener('open',resolve,{once:true});
      this.socket.addEventListener('error',()=>reject(new RelayFailure('network')),{once:true});
      this.socket.addEventListener('close',()=>reject(new RelayFailure('connection-closed')),{once:true});
    }),this.timeout);
  }
  async next(matches, timeout=this.timeout) {
    if(this.failure) throw this.failure;
    const i=this.queue.findIndex(matches);
    if(i>=0) return this.queue.splice(i,1)[0];
    let waiter;
    try { return await bounded(new Promise((resolve,reject)=>{
      waiter={matches,resolve,reject}; this.waiters.push(waiter);
    }),Math.max(1,timeout)); } finally { this.waiters=this.waiters.filter(x=>x!==waiter); }
  }
  send(message) {
    if(this.socket.readyState!==1) throw new RelayFailure('connection-closed');
    this.socket.send(JSON.stringify(message));
  }
  async write(label,event) {
    this.send([label,event]);
    return this.next(m=>m[0]==='OK' && m[1]===event.id);
  }
  async query(filter,limit) {
    const id=globalThis.crypto.randomUUID(); const events=[];const deadline=Date.now()+this.timeout;
    this.send(['REQ',id,{...filter,limit}]);
    try {
      while(events.length<limit) {
        const m=await this.next(m=>['EVENT','EOSE','CLOSED'].includes(m[0]) && m[1]===id,deadline-Date.now());
        if(m[0]==='CLOSED') throw new RelayFailure(rejection(m[2]));
        if(m[0]==='EOSE') return {events,status: m[2]==='auth'?'auth-required':'complete'};
        try {
          const e=signedEvent(m[2]);
          if(matchFilter(filter,e) && !events.some(x=>x.id===e.id)) events.push(e);
        } catch { /* Unverified events cannot become metadata or readback. */ }
      }
      return {events,status:'limited'};
    } finally { if(this.socket.readyState===1) this.send(['CLOSE',id]); }
  }
  close() { if(this.socket.readyState<2) this.socket.close(); }
}

export class RelayTransport {
  constructor(options={}) { this.options=options; }
  async query(url,filter,limit=64) {
    const session=new Session(url,this.options);
    try { await session.connect(); return await session.query(filter,limit); }
    finally { session.close(); }
  }
  async publish(url,event,{signAuth,authPubkey,readback=true}={}) {
    const session=new Session(url,this.options);
    try {
      await session.connect();
      let ok=await session.write('EVENT',event); let authenticated=false;
      const authenticate=async()=>{
        if(!session.challenge||!signAuth) throw new RelayFailure('auth-required');
        const template={kind:22242,created_at:Math.floor(Date.now()/1000),content:'',
          tags:[['relay',url],['challenge',session.challenge]]};
        const frozen=JSON.stringify(template);let auth;
        try { auth=signedEvent(await bounded(Promise.resolve().then(()=>signAuth(structuredClone(template))),
          this.options.signerTimeout??60000,'auth-timeout')); }
        catch { throw new RelayFailure('auth-denied'); }
        const actual={kind:auth.kind,created_at:auth.created_at,content:auth.content,tags:auth.tags};
        if(!authPubkey || auth.pubkey!==authPubkey || JSON.stringify(actual)!==frozen)
          throw new RelayFailure('auth-mismatch');
        const authOK=await session.write('AUTH',auth);
        if(!authOK[2]) throw new RelayFailure(rejection(authOK[3]));
        authenticated=true;
      };
      if(!ok[2] && rejection(ok[3])==='auth-required' && signAuth) {
        await authenticate();ok=await session.write('EVENT',event);
      }
      const code=ok[2]?'accepted':rejection(ok[3]);
      if(!ok[2] && code!=='duplicate') return {accepted:false,verified:false,code,authenticated};
      if(!readback) return {accepted:ok[2]===true,verified:false,code,authenticated,readback:'not-expected'};
      try {
        let got;
        try { got=await session.query({ids:[event.id]},1); }
        catch(error) {
          if(error.code!=='auth-required'||authenticated||!signAuth)throw error;
          await authenticate();got=await session.query({ids:[event.id]},1);
        }
        const verified=got.events.some(x=>x.id===event.id);
        return {accepted:true,verified,code,authenticated,readback:verified?'verified':got.status==='complete'?'missing':got.status};
      } catch(error) { return {accepted:true,verified:false,code,authenticated,readback:error.code??'network'}; }
    } finally { session.close(); }
  }
}

export async function fetchJSON(url,{fetch=globalThis.fetch,timeout=5000,maxBytes=65536}={}) {
  const response=await fetch(url,{headers:{Accept:'application/nostr+json'},redirect:'error',signal:AbortSignal.timeout(timeout)});
  if(!response.ok) throw new RelayFailure('metadata-unavailable');
  const reader=response.body.getReader(); let size=0; const chunks=[];
  try {
    while(true) { const {done,value}=await reader.read(); if(done) break;
      size+=value.length; if(size>maxBytes) throw new RelayFailure('response-limit'); chunks.push(value); }
  } finally { await reader.cancel(); }
  const bytes=new Uint8Array(size); let offset=0;
  for(const value of chunks) { bytes.set(value,offset); offset+=value.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
