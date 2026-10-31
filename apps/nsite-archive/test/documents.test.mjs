import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const documents={index:'library',publishers:'publishers',site:'site',history:'history',compare:'compare',page:'page',collect:'collect',backup:'backup',help:'help',view:'view'};
test('ten separately loadable HTML documents have independent controllers and ordinary links',()=>{
 const controllers=new Set();
 for(const [name,page] of Object.entries(documents)){
  const html=fs.readFileSync(path.join(root,name+'.html'),'utf8');assert(html.includes(`data-page="${page}"`));assert.match(html,/<h1>/);assert(!/href=["']#\//.test(html));
  const script=html.match(/<script type="module" src="([^"]+)"/)[1];assert(fs.existsSync(path.resolve(root,script)));controllers.add(script);
  for(const [,href] of html.matchAll(/href="([^"]+)"/g)){if(!href.startsWith('http'))assert(fs.existsSync(path.resolve(root,href.split('?')[0])),`${name}: ${href}`);}
 }
 assert.equal(controllers.size,10);assert(!fs.existsSync(path.join(root,'app.js')));
});
test('all page controllers navigate documents rather than swapping routes',()=>{
 for(const file of fs.readdirSync(path.join(root,'pages'))){const code=fs.readFileSync(path.join(root,'pages',file),'utf8');assert(!code.includes('location.hash='));assert(!code.includes('renderers='));assert(!code.includes("href=\"#/"));}
 const cache=fs.readFileSync(path.join(root,'sw.js'),'utf8');assert(cache.includes('ignoreSearch:true'),'offline document requests retain query parameters');
});
