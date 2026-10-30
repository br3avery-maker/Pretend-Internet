import { verifyEvent } from 'nostr-tools/pure';
export const hex64=value=>typeof value==='string' && /^[0-9a-f]{64}$/.test(value);
export const bytes=value=>new TextEncoder().encode(value).length;
export function signedEvent(input) {
  if(!input || !Number.isInteger(input.kind) || input.kind<0 || input.kind>65535 ||
    !Number.isSafeInteger(input.created_at) || input.created_at<0 || !hex64(input.id) || !hex64(input.pubkey) ||
    typeof input.sig!=='string' || !/^[0-9a-f]{128}$/.test(input.sig) || typeof input.content!=='string' ||
    input.content.length>1048576 || !Array.isArray(input.tags) || input.tags.length>4096 ||
    input.tags.some(t=>!Array.isArray(t)||t.length<1||t.length>64||t.some(x=>typeof x!=='string'||x.length>65536)))
    throw Error('invalid-event');
  // Copy only protocol fields: discard verifier cache symbols and foreign data.
  const e={id:input.id,pubkey:input.pubkey,created_at:input.created_at,kind:input.kind,
    tags:input.tags.map(t=>[...t]),content:input.content,sig:input.sig};
  if(bytes(JSON.stringify(e))>2097152 || !verifyEvent(e)) throw Error('invalid-signature');
  return e;
}
export function classifyKind(kind) {
  if(!Number.isInteger(kind)||kind<0||kind>65535) throw Error('invalid-kind');
  if(kind===0 || kind===3 || (kind>=10000&&kind<20000)) return 'replaceable';
  if(kind>=20000&&kind<30000) return 'ephemeral';
  if(kind>=30000&&kind<40000) return 'addressable';
  if((kind>=1000&&kind<10000)||(kind>=4&&kind<45)||kind===1||kind===2) return 'regular';
  return 'unspecified';
}
export function normalizeURL(value,{http=false,allowLocal=false}={}) {
  if(typeof value!=='string'||value.length>2048) throw Error('invalid-url');
  const u=new URL(value);
  if(!(http?['https:','http:']:['wss:','ws:']).includes(u.protocol)||u.username||u.password||u.search||u.hash)
    throw Error('unsafe-url');
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  const privateHost=host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||
    (!host.includes('.')&&!host.includes(':')) || /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    /^(::|::1|f[cd][0-9a-f]*:|fe[89ab][0-9a-f]*:|ff[0-9a-f]*:|::ffff:)/i.test(host);
  if(!allowLocal && (privateHost || ['http:','ws:'].includes(u.protocol))) throw Error('unsafe-destination');
  return u.pathname==='/'?u.toString().replace(/\/$/,''):u.toString();
}
export function latest(events) {
  return [...events].sort((a,b)=>b.created_at-a.created_at || a.id.localeCompare(b.id))[0];
}
export function pow(id) {
  let count=0; for(const c of id) { const n=parseInt(c,16); if(n===0) count+=4;
    else { count+=Math.clz32(n)-28; break; } } return count;
}
export function httpStatus(status) {
  return ({200:'preflight-accepted',201:'preflight-accepted',400:'invalid',401:'auth-required',402:'payment-required',403:'policy',
    404:'preflight-unsupported',405:'preflight-unsupported',411:'length-required',413:'size',415:'media-type',
    429:'rate-limited',501:'preflight-unsupported',503:'unavailable'})[status]??'unknown';
}
