import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { once } from 'node:events';
import { matchFilter } from 'nostr-tools/filter';
import { verifyEvent } from 'nostr-tools/pure';
export async function serve({info={},reject=()=>null,metadata=[],store=true,auth=false,corruptReadback=false,preflight=200,slow=false,authRead=false,malformedOK=false}={}) {
  const published=[];const requests=[];const authEvents=[];const events=new Map();
  const server=createServer((req,res)=>{
    requests.push({method:req.method,url:req.url,headers:req.headers});
    if(req.method==='HEAD') {res.writeHead(preflight);res.end();return;}
    res.setHeader('Content-Type','application/nostr+json');res.end(JSON.stringify(info));
  });
  const ws=new WebSocketServer({server});
  ws.on('connection',socket=>{
    let authed=false;const challenge='local-test-challenge';
    if(auth||authRead)socket.send(JSON.stringify(['AUTH',challenge]));
    socket.on('message',raw=>{
      const m=JSON.parse(raw.toString());const send=data=>socket.send(JSON.stringify(data));
      if(m[0]==='AUTH') { const e=m[1];authEvents.push(e);
        authed=verifyEvent(e)&&e.kind===22242&&e.tags.some(t=>t[0]==='challenge'&&t[1]===challenge);
        send(['OK',e.id,authed,authed?'':'restricted: invalid auth']);return; }
      if(m[0]==='EVENT') {const e=m[1];published.push(e);
        if(auth&&!authed) {send(['OK',e.id,false,'auth-required: authenticate']);return;}
        const reason=reject(e,authed);if(reason) {send(['OK',e.id,false,reason]);return;}
        if(store)events.set(e.id,e);send(['OK',e.id,malformedOK?'yes':true,'']);return;}
      if(m[0]==='REQ') {
        if(slow)return;
        if(authRead&&!authed&&m[2].ids){send(['CLOSED',m[1],'auth-required: read needs auth']);return;}
        const filter=m[2];
        for(const e of [...metadata,...events.values()].filter(e=>matchFilter(filter,e)).slice(0,filter.limit??64))
          send(['EVENT',m[1],corruptReadback&&filter.ids?{...e,content:'corrupted'}:e]);
        send(['EOSE',m[1]]);
      }
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`127.0.0.1:${server.address().port}`;
  return {url:`ws://${base}`,http:`http://${base}`,published,requests,authEvents,events,
    close:async()=>{for(const c of ws.clients)c.terminate();await new Promise(resolve=>ws.close(()=>server.close(resolve)));}};
}
