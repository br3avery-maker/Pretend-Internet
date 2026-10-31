import fs from 'node:fs';import {fixtureBundle,signed} from './fixtures.mjs';
fs.writeFileSync(new URL('./test-bundle.json',import.meta.url),JSON.stringify(fixtureBundle()));
fs.writeFileSync(new URL('./test-events.json',import.meta.url),JSON.stringify([signed({identifier:'imported',title:'Imported signed publication'}).event]));
console.log('Serve the app over HTTP and open test/browser.html. Use a disposable browser origin: tests seed that origin’s archive.');

const shell=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const transport=`<script>window.expectedCollectionTitle='';const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(url,options){const collection=String(url).endsWith('/collect-worker.js');super(collection?new URL('./collection-fixture.js',location.href):url,options);this.collectionFixture=collection;}postMessage(data,...args){if(this.collectionFixture&&data.type==='collect')data.options.testTitle=window.expectedCollectionTitle;super.postMessage(data,...args);}};</script>`;
fs.writeFileSync(new URL('./ui-app.html',import.meta.url),shell.replace('href="./style.css"','href="../style.css"').replace('src="./app.js"','src="../app.js"').replace('</head>',transport+'</head>'));
