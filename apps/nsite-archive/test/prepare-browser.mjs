import fs from 'node:fs';import {fixtureBundle,signed} from './fixtures.mjs';
fs.writeFileSync(new URL('./test-bundle.json',import.meta.url),JSON.stringify(fixtureBundle()));
fs.writeFileSync(new URL('./test-events.json',import.meta.url),JSON.stringify([signed({identifier:'imported',title:'Imported signed publication'}).event]));
const item=signed({identifier:'garden',author:7,files:{'/index.html':'<!doctype html><style>body{background:#f0fff0;color:#123;font:22px sans-serif}h1{color:#a00060}</style><h1>Garden seed exchange</h1><p>Neighbours exchange vegetable seeds and planting advice. Open the notes for seasonal tips.</p><a href="notes.txt">Planting notes</a>','/notes.txt':'Plant tomato seeds in spring. Share seedlings with neighbours.'}});
fs.writeFileSync(new URL('./pipeline-fixtures.json',import.meta.url),JSON.stringify({bundle:fixtureBundle(),item}));
console.log('pipeline.html checks the new download/index/preview/recovery flow. For its continuity HTTP check only, serve each item.files body at /<sha256> on the disposable test origin.');
