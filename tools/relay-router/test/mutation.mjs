import { mkdtemp,cp,symlink,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const temp=await mkdtemp(join(tmpdir(),'relay-router-mutation-'));
try {
  for(const file of ['router.mjs','validation.mjs','transport.mjs','package.json','test'])
    await cp(join(root,file),join(temp,file),{recursive:true});
  await symlink(join(root,'node_modules'),join(temp,'node_modules'),'dir');
  const path=join(temp,'transport.mjs');const original=await readFile(path,'utf8');
  const target='const verified=got.events.some(x=>x.id===event.id);';
  if(!original.includes(target))throw Error('Mutation target missing');
  await writeFile(path,original.replace(target,'const verified=true; // intentional adversarial mutation'));
  const result=spawnSync(process.execPath,['--test','--test-name-pattern=durable acceptance with corrupt','test/router.test.mjs'],{cwd:temp,encoding:'utf8',timeout:10000});
  if(result.status===0||result.error)throw Error('Verification mutation was not rejected');
  console.log(JSON.stringify({mutation:'claim readback verified without checking returned event',rejected:true,mutantExitCode:result.status}));
} finally {await rm(temp,{recursive:true,force:true});}
