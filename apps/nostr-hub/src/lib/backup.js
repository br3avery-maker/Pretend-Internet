import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { signedEvent } from '../../../../tools/relay-router/validation.mjs';
import { digest, safePath, validPubkey, webURL } from './model.js';
import { backupSnapshot, restoreBackupRecords, localBackupSettings, restoreBackupSettings } from './store.js';

const version='pretend-internet.nostr-hub.backup.v1';
const maxSize=128*1024*1024, maxFile=24*1024*1024;
const names=['events','books','files','receipts'];
const hex=/^[a-f0-9]{64}$/;
const token=/^[a-f0-9-]{36}$/;
const scope='(?:guest|[a-f0-9]{64}):(?:note|article|track|nsite):(?:draft|new:(?:root|named)|unselected|(?:15128|35128):[a-f0-9]{64}:[a-z0-9-]{0,13})';
const draftKey=new RegExp('^draft:'+scope+'$');
const stageKey=new RegExp('^staged:'+scope+'$');
const selectionKey=new RegExp('^staged-selection:staged:'+scope+'$');
const exact=new Set(['account','accounts','relays','blossom','hidden-publishers','safe-publishers','approved-publications','saved-sites','collections','book-edits','bookmarks','positions','last-book','reader-display','music-position','draft-type','drafts']);
const pubTypes=['note','article','track','nsite'];
const isObject=v=>v!==null && typeof v==='object' && !Array.isArray(v);
const text=(v,max=100000)=>typeof v==='string'&&v.length<=max;
const check=(condition,message='Invalid backup structure.')=>{if(!condition) throw Error(message);};
const strings=(v,max=20000)=>Array.isArray(v)&&v.length<=max&&v.every(x=>text(x,4096));
const objectRows=(v,test)=>isObject(v)&&Object.entries(v).every(([k,row])=>text(k,4096)&&test(row));
const fields=(v,allowed)=>isObject(v)&&Object.keys(v).every(key=>allowed.includes(key));
export const backupSettingKey=key=>exact.has(key)||draftKey.test(key)||selectionKey.test(key);
const draftValid=v=>fields(v,['type','title','slug','body','artist','server','relays','fallbackServers'])
  &&Object.entries(v).every(([k,x])=>k==='relays'||k==='fallbackServers'?strings(x,12):text(x))
  &&(!v.type||pubTypes.includes(v.type));
function validSetting(key,v) {
  if (draftKey.test(key)) return draftValid(v);
  if (selectionKey.test(key)) return v===null||typeof v==='string'&&token.test(v);
  if (['account','last-book','draft-type'].includes(key)) return text(v,4096)&&
    (key!=='account'||!v||validPubkey(v))&&(key!=='draft-type'||pubTypes.includes(v));
  if (['accounts','hidden-publishers','safe-publishers'].includes(key)) return strings(v)&&v.every(validPubkey);
  if (['relays','blossom','approved-publications','saved-sites'].includes(key)) return strings(v);
  if (key==='collections') return Array.isArray(v)&&v.every(x=>fields(x,['name','items'])&&text(x.name,60)&&strings(x.items));
  if (key==='book-edits') return objectRows(v,x=>fields(x,['title','author','series','topics'])&&Object.entries(x).every(([k,y])=>k==='topics'?strings(y):text(y,1000)));
  if (key==='bookmarks') return objectRows(v,strings);
  if (key==='positions') return objectRows(v,x=>fields(x,['chapter','y'])&&Number.isSafeInteger(x.chapter)&&x.chapter>=0&&Number.isFinite(x.y)&&x.y>=0);
  if (key==='reader-display') return fields(v,['size','spacing','font','light'])&&v.size>=15&&v.size<=34&&v.spacing>=1.2&&v.spacing<=2.2&&['serif','sans-serif'].includes(v.font)&&typeof v.light==='boolean';
  if (key==='music-position') return fields(v,['key','time'])&&text(v.key,4096)&&Number.isFinite(v.time)&&v.time>=0;
  if (key==='drafts') return fields(v,pubTypes)&&Object.values(v).every(draftValid);
  return false;
}
// Plain-data JSON only; no prototype-changing keys or unbounded nesting.
function plain(v,depth=0) {
  check(depth<=24,'Backup nesting exceeds the limit.');
  if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number'&&Number.isFinite(v))return;
  check(typeof v==='object','Invalid backup value.');
  for(const [key,value] of Object.entries(v)){
    check(!['__proto__','prototype','constructor'].includes(key),'Unsafe backup key.');
    plain(value,depth+1);
  }
}
export function sameBackupValue(a,b) {
  if(a===b)return true;
  if(a instanceof Uint8Array && b instanceof Uint8Array) return a.length===b.length&&a.every((v,i)=>v===b[i]);
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a).filter(key=>key!=='recovered'&&a[key]!==undefined);
  const other=Object.keys(b).filter(key=>key!=='recovered'&&b[key]!==undefined);
  return keys.length===other.length&&keys.every(key=>Object.hasOwn(b,key)&&sameBackupValue(a[key],b[key]));
}
function validateBook(row) {
  check(fields(row,['id','title','author','format','chapters'])&&/^local:[a-f0-9]{64}$/.test(row.id)&&row.format==='markdown'&&text(row.title,1000)&&text(row.author,1000)
    &&Array.isArray(row.chapters)&&row.chapters.length>0&&row.chapters.length<=20000&&row.chapters.every(x=>fields(x,['id','title','text'])&&text(x.id,128)&&text(x.title,10000)&&text(x.text,4*1024*1024))
    &&new Set(row.chapters.map(x=>x.id)).size===row.chapters.length&&row.chapters.reduce((n,x)=>n+x.text.length,0)<=4*1024*1024,'Invalid local book.');
  return row;
}
function validateReceipt(row) {
  const keys=['id','fingerprint','account','type','title','createdAt','status','uploads','attempts','uploadServers','uploadAttempts','blossomPreflight','relayPlan','event','url','baseline','address','action','recovered'];
  check(fields(row,keys)&&text(row.id,128)&&validPubkey(row.account)&&pubTypes.includes(row.type)&&text(row.title,1000)&&Number.isSafeInteger(row.createdAt)
    &&['reviewed','uploading','signed','verified','partially-verified','accepted-unverified','not-delivered'].includes(row.status)
    &&isObject(row.uploads)&&Object.entries(row.uploads).every(([hash,url])=>hex.test(hash)&&!!webURL(url))&&Array.isArray(row.attempts)
    &&row.attempts.length<=128&&row.attempts.every(x=>fields(x,['url','accepted','verified','code'])&&text(x.url,2048)&&text(x.code,512)&&typeof x.accepted==='boolean'&&typeof x.verified==='boolean'),'Invalid publication receipt.');
  for(const key of ['event','baseline']) if(row[key]){row[key]=signedEvent(row[key]);check(row[key].pubkey===row.account,'Receipt owner mismatch.');}
  if(row.url)check(!!webURL(row.url),'Unsafe publication URL.');
  if(row.uploadAttempts)check(Array.isArray(row.uploadAttempts)&&row.uploadAttempts.length<=8192&&row.uploadAttempts.every(x=>fields(x,['hash','server','status'])&&hex.test(x.hash)&&text(x.server,2048)&&['failed','verified'].includes(x.status)),'Invalid upload evidence.');
  if(row.uploadServers)check(isObject(row.uploadServers)&&Object.entries(row.uploadServers).every(([hash,url])=>hex.test(hash)&&!!webURL(url)),'Invalid upload destinations.');
  // Historic receipts are not proof of current relay state and never authorize retry.
  return {...row,recovered:true};
}
export async function encodeBackup(snapshot,settings) {
  const entries=Object.create(null);
  const records={...snapshot,files:[]};
  for(const record of snapshot.files) {
    const files=[];
    for(const file of record.files) {
      const hash=await digest(file.bytes);
      check(hash===file.hash,'Staged file hash mismatch: '+file.path);
      entries['blobs/'+hash]=file.bytes;
      const {bytes,...metadata}=file;
      files.push(metadata);
    }
    records.files.push({...record,files});
  }
  const manifest={schema:version,records,settings};
  entries['manifest.json']=strToU8(JSON.stringify(manifest));
  check(Object.values(entries).reduce((n,v)=>n+v.length,0)<=maxSize,'Backup exceeds the 128 MiB uncompressed limit.');
  const bytes=zipSync(entries,{level:3});
  // Verify the exact bytes before offering a file.
  await decodeBackup(bytes);
  return bytes;
}
export async function decodeBackup(bytes) {
  check(bytes.length<=maxSize,'Backup exceeds 128 MiB.');
  let size=0;const paths=new Set();
  const entries=unzipSync(bytes,{filter(row){
    check(row.name==='manifest.json'||/^blobs\/[a-f0-9]{64}$/.test(row.name),'Unexpected backup entry.');
    check(!paths.has(row.name)&&paths.size<8192,'Duplicate or too many backup entries.');
    paths.add(row.name);size+=row.originalSize;
    check(size<=maxSize&&(row.name==='manifest.json'||row.originalSize<=maxFile),'Backup expansion exceeds the limit.');
    return true;
  }});
  check(entries['manifest.json'],'Backup manifest missing.');
  const data=JSON.parse(strFromU8(entries['manifest.json']));
  plain(data);
  check(fields(data,['schema','records','settings'])&&data.schema===version&&fields(data.records,names)&&isObject(data.settings),'Unsupported backup version.');
  for(const name of names)check(Array.isArray(data.records[name])&&data.records[name].length<=20000,'Invalid record count.');
  for(const [key,v] of Object.entries(data.settings))check(backupSettingKey(key)&&validSetting(key,v),'Invalid or nonportable setting: '+key);
  const records={events:data.records.events.map(signedEvent),books:data.records.books.map(validateBook),receipts:data.records.receipts.map(validateReceipt),files:[]};
  const used=new Set();
  for(const row of data.records.files) {
    check(fields(row,['id','selection','files'])&&stageKey.test(row.id)&&typeof row.selection==='string'&&token.test(row.selection)&&Array.isArray(row.files)&&row.files.length<=256,'Invalid staged file record.');
    let total=0;const files=[];
    for(const file of row.files){
      check(fields(file,['path','hash','type'])&&text(file.path,4095)&&safePath(file.path)&&hex.test(file.hash)&&text(file.type,256)&&!/[\r\n]/.test(file.type),'Invalid staged file.');
      const path='blobs/'+file.hash, bytes=entries[path];
      check(bytes&&await digest(bytes)===file.hash,'Missing or corrupt staged blob.');
      used.add(path);total+=bytes.length;check(total<=48*1024*1024,'Staged selection exceeds 48 MiB.');
      files.push({...file,bytes});
    }
    records.files.push({...row,files});
  }
  check(paths.size===used.size+1,'Unexpected unreferenced blob.');
  for(const name of names)check(new Set(records[name].map(row=>row.id)).size===records[name].length,'Duplicate record ID.');
  return {records,settings:data.settings};
}
export async function exportLocalBackup() {
  return encodeBackup(await backupSnapshot(),localBackupSettings(backupSettingKey));
}
export async function restoreLocalBackup(data) {
  const apply=async lock=>{
    check(lock,'Another publication or restore is in progress.');
    const rollback=restoreBackupSettings(data.settings,sameBackupValue);
    try {await restoreBackupRecords(data.records,sameBackupValue);}
    catch(error){rollback();throw error;}
    const actual=await backupSnapshot(),settings=localBackupSettings(backupSettingKey);
    for(const name of names){
      const rows=new Map(actual[name].map(row=>[row.id,row]));
      for(const row of data.records[name])check(sameBackupValue(rows.get(row.id),row),'Restore readback mismatch: '+name);
    }
    for(const [key,value] of Object.entries(data.settings))check(sameBackupValue(settings[key],value),'Settings readback mismatch.');
    return Object.fromEntries(names.map(name=>[name,data.records[name].length]));
  };
  return globalThis.navigator?.locks?navigator.locks.request('pretend-internet:publish',{ifAvailable:true},apply):apply(true);
}
