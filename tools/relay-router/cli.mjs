#!/usr/bin/env node
import { readFile,writeFile,rename } from 'node:fs/promises';
import { RelayRouter,Registry } from './router.mjs';
const args=process.argv.slice(2);
const usage='Usage: node cli.mjs event.json [--config config.json] [--state cache.json] [--publish]';
try {
  if(!args[0]||args[0].startsWith('--'))throw Error('usage');
  const path=args.shift();let configPath,statePath,publish=false;
  while(args.length){const arg=args.shift();
    if(arg==='--publish')publish=true;
    else if(arg==='--config'&&args[0])configPath=args.shift();
    else if(arg==='--state'&&args[0])statePath=args.shift();
    else throw Error('usage');
  }
  const event=JSON.parse(await readFile(path,'utf8'));
  const config=configPath?JSON.parse(await readFile(configPath,'utf8')):{};
  const registry=new Registry();
  if(statePath)try{registry.restore(JSON.parse(await readFile(statePath,'utf8')));}catch(e){if(e.code!=='ENOENT')throw Error('invalid-cache');}
  const router=new RelayRouter({registry,bootstrap:config.bootstrap,pinned:config.pinned});
  const options={visibility:config.visibility,redundancy:config.redundancy,allowedRelays:config.allowedRelays,
    entitledRelays:config.entitledRelays,recipientLists:config.recipientLists};
  const receipt=publish?await router.publish(event,options):await router.discover(event,options);
  if(statePath){const temporary=statePath+'.pending';await writeFile(temporary,JSON.stringify(registry.snapshot(),null,2)+'\n',{mode:0o600});await rename(temporary,statePath);}
  console.log(JSON.stringify(receipt,null,2));
  if(publish&&receipt.status==='partial-or-failed')process.exitCode=2;
} catch(error) {
  console.error(error.message==='usage'?usage:'Relay routing failed; check signed event, configuration, local cache and network access.');
  process.exitCode=1;
}
