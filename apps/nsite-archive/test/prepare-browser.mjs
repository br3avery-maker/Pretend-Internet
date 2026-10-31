import fs from 'node:fs';import {fixtureBundle,signed} from './fixtures.mjs';
fs.writeFileSync(new URL('./test-bundle.json',import.meta.url),JSON.stringify(fixtureBundle()));
fs.writeFileSync(new URL('./test-events.json',import.meta.url),JSON.stringify([signed({identifier:'imported',title:'Imported signed publication'}).event]));
console.log('Serve the app over HTTP and open test/browser.html. Use a disposable browser origin: tests seed that origin’s archive.');
