// Runs test/pipeline.html in a real Chromium against a local fixture server.
// Only the two fixture-driven phases are exercised: the live-publication phase
// reaches public relays on purpose and stays a manual, separately recorded
// check. Deterministic or nothing: no retries, and any page error fails.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {startServer} from './serve.mjs';

const PREPARED = new URL('./pipeline-fixtures.json', import.meta.url);
const phaseTimeout = Number(process.env.PIPELINE_TIMEOUT_MS || 180000);

function prepare(){
  execFileSync(process.execPath, [new URL('./prepare-browser.mjs', import.meta.url).pathname], {stdio: 'ignore'});
}

function fail(message, extra = []){
  console.error(`FAIL ${message}`);
  for(const line of extra) console.error(line);
  process.exit(1);
}

async function phase(page, button, marker){
  await page.click(`#${button}`);
  const started = Date.now();
  while(Date.now() - started < phaseTimeout){
    const text = await page.textContent('#results');
    if(text.includes(marker)) return text;
    if(/\nFAIL /.test(text)) fail(`${button} reported a failure`, [text]);
    await page.waitForTimeout(250);
  }
  fail(`${button} did not reach ${JSON.stringify(marker)} within ${phaseTimeout}ms`, [await page.textContent('#results')]);
}

prepare();
const server = await startServer(0);
const browser = await chromium.launch();
const errors = [];
try{
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.stack || String(error)));
  page.on('console', message => {
    if(message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(`${server.origin}/test/pipeline.html`);
  const pipeline = await phase(page, 'run', 'ALL PIPELINE CHECKS PASSED');
  const continuity = await phase(page, 'continuity', 'ALL CONTINUITY CHECKS PASSED');
  if(errors.length) fail('page errors during the pipeline', errors);
  const lines = `${pipeline}\n${continuity}`.split('\n').filter(line => line.startsWith('PASS ') || line.startsWith('ALL '));
  const checks = lines.filter(line => line.startsWith('PASS ')).length;
  const contextLabel = await page.evaluate(() => (isSecureContext ? 'secure context' : 'non-secure context'));
  const report = [`Context: ${contextLabel}`, `PASS lines: ${checks}`, ...lines.map(line => '  ' + line)].join('\n');
  console.log(report);
  if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Browser pipeline\n\n\`\`\`\n${report}\n\`\`\`\n`);
  // 13 checks in the pipeline phase and 3 in the continuity phase today; the
  // floor fails a phase that returns early without listing its checks.
  if(checks < 15) fail(`only ${checks} PASS lines; the phases did not run as expected`, [report]);
  console.log('ALL BROWSER PIPELINE CHECKS PASSED');
} finally {
  await browser.close();
  await server.close();
}
