import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { groupSites, safePath, siteURL } from '../src/lib/model.js';
import { chaptersFromMarkdown } from '../src/lib/text.js';
import { execute, siteFiles, uploadVerified } from '../src/lib/publisher.js';

const author = 'a'.repeat(64);
const event = (id, timestamp, title, slug = 'game') => ({
  id, kind: 35128, pubkey: author, created_at: timestamp, tags: [['d', slug], ['title', title], ['description', 'An arcade game'], ['path', '/index.html', 'f'.repeat(64)]],
});

test('groups revisions by author and slug using only signed-event metadata fields', () => {
  const result = groupSites([event('old', 1, 'Old'), event('latest', 2, 'Latest'), event('different', 1, 'Another', 'other')]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].versions.map(item => item.id), ['latest', 'old']);
  assert.equal(result[0].title, 'Latest');
  assert.equal(result[0].category, 'Game');
  assert.equal(result[0].files, 1);
  assert.match(siteURL(author, 'game'), /^https:\/\/[a-z0-9]+game\.nsite\.lol\/$/);
  assert.equal(siteURL(author, '-bad'), '');
});

test('normalizes HTML and folder ZIP for review, hashes each file and rejects unsafe paths', async () => {
  const html = new File(['<h1>Test</h1>'], 'test.html');
  const [single] = await siteFiles([html]);
  assert.equal(single.path, '/index.html');
  assert.match(single.hash, /^[0-9a-f]{64}$/);
  const archive = new File([zipSync({ 'test/index.html': strToU8('<h1>Test</h1>'), 'test/style.css': strToU8('body{}') })], 'test.zip');
  assert.deepEqual((await siteFiles([archive])).map(file => file.path), ['/index.html', '/style.css']);
  const invalid = new File([zipSync({ 'index.html': strToU8('text'), '../bad.html': strToU8('bad') })], 'invalid.zip');
  await assert.rejects(siteFiles([invalid]), /invalid path/);
  assert.throws(() => safePath('/folder/%2e%2e/index.html'));
});

test('reuses the identical reviewed event and uploads on retry, and checks independent readback', async () => {
  const secret = generateSecretKey();
  let signs = 0;
  let uploads = 0;
  let available = false;
  const signer = { pubkey: getPublicKey(secret), sign: async value => { signs++; return finalizeEvent(value, secret); } };
  const draft = { type: 'nsite', title: 'Test', slug: 'test', body: '', server: 'https://blossom.fixture.example', relays: ['wss://relay.fixture.example'] };
  const files = await siteFiles([new File(['<h1>Test</h1>'], 'index.html')]);
  const options = {
    draft, files, signer, checkpoint: async () => {},
    upload: async () => { uploads++; return 'https://blossom.fixture.example/file'; },
    transport: {
      async publish() { return { accepted: true, verified: available, code: 'accepted' }; },
    },
  };
  const initial = await execute(options);
  assert.equal(initial.status, 'accepted-unverified');
  available = true;
  const retried = await execute({ ...options, previous: initial });
  assert.equal(retried.event.id, initial.event.id);
  assert.equal(retried.status, 'verified');
  assert.equal(signs, 1);
  assert.equal(uploads, 1);
});

test('does not treat an upload descriptor as proof of the retrieved bytes', async () => {
  const [file] = await siteFiles([new File(['original'], 'index.html')]);
  const url = 'https://blossom.fixture.example/' + file.hash;
  const sign = async value => value;
  const response = async (requestURL, options) => {
    if (options.method === 'PUT') return Response.json({ url, sha256: file.hash });
    return new Response('corrupt!');
  };
  await assert.rejects(uploadVerified(file, 'https://blossom.fixture.example', sign, response), /differs/);
});

test('Markdown uses headings without dropping a preface or collapsing chapter identities', () => {
  const chapters = chaptersFromMarkdown('A preface.\n\n# First\n\nOne.\n\n## Second\n\nTwo.');
  assert.deepEqual(chapters.map(chapter => chapter.title), ['Start', 'First', 'Second']);
  assert.deepEqual(chapters.map(chapter => chapter.id), ['1', '2', '3']);
  assert.match(chapters[0].text, /preface/);
});
