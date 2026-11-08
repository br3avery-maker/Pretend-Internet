// Regression against the CSS rewriter extracted from the shipped launcher.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../web2app/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Shipped launcher script exists');
const start = script.indexOf(' async function rewriteCSS(css,dir){');
const end = script.indexOf('\n for(const elem of doc.querySelectorAll', start);
assert.ok(start >= 0 && end > start, 'Shipped CSS rewriting function exists');
const source = script.slice(start, end);

async function render(css) {
  const converted = [];
  const rewrite = new Function('convert', source + '\nreturn rewriteCSS;')(
    async (url, dir) => {
      converted.push({ url, dir });
      return 'blob:fixture/' + encodeURIComponent(url);
    }
  );
  return { output: await rewrite(css, 'site/assets/'), converted };
}

test('quoted CSS URLs containing spaces and Unicode are rewritten', async () => {
  const { output, converted } = await render(
    'a{background:url("my image.png")}b{mask:url(\'café icon.svg#check\')}'
  );
  assert.match(output, /url\("blob:fixture\/my%20image\.png"\)/);
  assert.match(output, /url\("blob:fixture\/caf%C3%A9%20icon\.svg%23check"\)/);
  assert.deepEqual(converted, [
    { url: 'my image.png', dir: 'site/assets/' },
    { url: 'café icon.svg#check', dir: 'site/assets/' }
  ]);
});

test('unquoted CSS URLs and quoted font filenames retain existing rewriting', async () => {
  const { output, converted } = await render(
    'a{background:url(plain.png)}b{src:url("web font.woff2")}'
  );
  assert.match(output, /url\("blob:fixture\/plain\.png"\)/);
  assert.match(output, /url\("blob:fixture\/web%20font\.woff2"\)/);
  assert.deepEqual(converted.map(item => item.url), ['plain.png', 'web font.woff2']);
});
