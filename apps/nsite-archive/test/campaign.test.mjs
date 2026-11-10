import test from 'node:test';import assert from 'node:assert/strict';
import {campaignMatch} from '../campaign.js';
import {buildCatalog,listCatalog} from '../model.js';
import {parseManifest} from '../vendor/archive-engine.js';
import {signed} from './fixtures.mjs';

const OPENER='Independent web researcher';

test('the confirmed campaign needs the opener, a resource promise and an unrelated link',()=>{
 const match=campaignMatch(`${OPENER} sharing curated resources at promo-example.com`);
 assert.equal(match.prefix,OPENER);
 assert.deepEqual(match.reasons,['role-phrase','resource-promise','external-link']);
 for(const nearMiss of [
  `${OPENER} studying telescope optics.`,
  `${OPENER} notes and field reports at rfc-editor.org.`,
  `${OPENER} sharing curated resources with students.`,
  // A file or library name is not the unrelated external link.
  `${OPENER} sharing my index.html and styles.css`,
  `${OPENER} offering a guide to Node.js`,
  `${OPENER} providing app.js examples`,
  `${OPENER} curating notes in data.json`,
  `${OPENER} sharing an epub.pdf`,
  // Two openers already contain a promise word; it is not evidence of one.
  'Community writer sharing notes at shelf.example',
  'Digital resources editor studying telescope optics at rfc-editor.org',
 ]) assert.equal(campaignMatch(nearMiss),null,`near miss excluded: ${nearMiss}`);
 // A file reference followed by a real domain is still an unrelated link.
 assert.deepEqual(campaignMatch(`${OPENER} offering index.html and guides at shelf.example`).reasons,['role-phrase','resource-promise','external-link']);
 assert.equal(campaignMatch('Serial work | 106'),null);
 assert.equal(campaignMatch('Independent web researchership sharing curated resources at promo-example.com'),null);
 assert.equal(campaignMatch('Release 1.2.3 notes'),null);
});

test('catalog excludes the full signature but keeps undecided near misses visible everywhere',()=>{
 const records=[
  signed({author:3,identifier:'campaign-full',description:`${OPENER} sharing curated resources at promo-example.com`}),
  signed({author:4,identifier:'near-opener',description:`${OPENER} studying telescope optics.`,files:{'/index.html':'<h1>Optics notes</h1>'}}),
  signed({author:5,identifier:'near-domain',description:`${OPENER} notes and field reports at rfc-editor.org.`,files:{'/index.html':'<h1>Standards notes</h1>'}}),
  signed({author:6,identifier:'near-promise',description:`${OPENER} sharing curated resources with students.`,files:{'/index.html':'<h1>Teaching notes</h1>'}}),
  signed({author:7,identifier:'serial-106',title:'Serial work | 106',files:{'/index.html':'<h1>A legitimate serial publication</h1>'}}),
  signed({author:9,identifier:'near-file',description:`${OPENER} sharing my index.html and Node.js notes`,files:{'/index.html':'<h1>File notes</h1>'}}),
 ].map(({event})=>{const v=parseManifest(event);return {...v,id:v.site};});
 const bodyOnly=parseManifest(signed({author:8,identifier:'body-campaign'}).event);
 records.push({...bodyOnly,id:bodyOnly.site});
 const pages=[{hash:bodyOnly.files[0].hash,path:'/index.html',data:{description:`${OPENER} sharing curated resources at promo-body.example.com`}}];
 const c=buildCatalog(records,pages,[],[]),list=listCatalog(c);
 assert.equal(list.excluded,2);
 assert.equal(list.total,5);
 assert.deepEqual(c.sites.find(s=>s.id===records[0].site).campaign.reasons,['role-phrase','resource-promise','external-link']);
 assert.equal(listCatalog(c,{query:'promo-example'}).total,0);
 assert.equal(listCatalog(c,{query:'campaign-full'}).total,0);
 assert.equal(listCatalog(c,{query:'web researcher'}).total,4);
 assert.equal(listCatalog(c,{query:'Node.js'}).total,1);
 assert(!list.publishers.some(p=>p.id===records[0].event.pubkey));
 assert.equal(list.publishers.length,5);
 assert(list.rows.every(s=>s.campaign===null));
 assert(list.rows.some(s=>s.title==='Serial work | 106'));
});
