// Loopback-only end-to-end demonstration. No external relay writes.
import { finalizeEvent } from 'nostr-tools/pure';
import { RelayRouter,Registry } from './router.mjs';
import { serve } from './test/relay-server.mjs';
const key=new Uint8Array(32).fill(42);const at=Math.floor(Date.now()/1000);
const sign=(kind,tags=[],content='')=>finalizeEvent({kind,tags,content,created_at:at},key);
const destination=await serve();
const report=sign(30166,[['d',destination.url],['k','54321']]);
const bootstrap=await serve({metadata:[report],reject:()=> 'unsupported-kind: local refusal'});
try {
  const router=new RelayRouter({bootstrap:[bootstrap.url],pinned:[bootstrap.url],registry:new Registry({allowLocal:true})});
  const receipt=await router.publish(sign(54321,[],'generated artifact manifest'),{redundancy:1});
  console.log(JSON.stringify(receipt,null,2));
  if(receipt.status!=='verified')process.exitCode=1;
} finally {await bootstrap.close();await destination.close();}
