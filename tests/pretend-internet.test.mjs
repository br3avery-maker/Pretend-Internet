import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { resolveSafePath } from '../server.mjs';
import {
  PLACES,
  filterPlaces,
  sanitizeBookmarkUrl,
  createBookmark,
  togglePinned,
  recordRecentVisit,
} from '../portal-core.mjs';
import {
  parseDocumentToChapters,
  stripHtmlToText,
  clampChapterIndex,
  getSyntheticSampleBook,
  validateShelfBackup,
} from '../apps/pocket-reader/reader-core.mjs';
import {
  parseTags,
  createNote,
  updateNote,
  filterNotes,
  noteStats,
  parseSafeMarkdownBlocks,
  exportNotesToMarkdown,
  validateNotesBackup,
} from '../apps/pocket-notes/notes-core.mjs';
import {
  validateEventShape,
  computeCanonicalEventId,
  parseRelayListEvent,
  classifyFromMetadataOnly,
  analyzeEventsMetadataOnly,
  getSyntheticFixtureEvents,
} from '../apps/nsite-directory/directory-core.mjs';

test('server resolveSafePath blocks traversal and hidden dotfiles', () => {
  const root = '/tmp/fake-root';
  assert.equal(resolveSafePath('/', root), '/tmp/fake-root/index.html');
  assert.equal(resolveSafePath('/apps/pocket-reader/index.html', root), '/tmp/fake-root/apps/pocket-reader/index.html');
  assert.equal(resolveSafePath('/../etc/passwd', root), null);
  assert.equal(resolveSafePath('/%2e%2e/secret', root), null);
  assert.equal(resolveSafePath('/.git/config', root), null);
  assert.equal(resolveSafePath('/.env', root), null);
  assert.equal(resolveSafePath('/.env.local', root), null);
  assert.equal(resolveSafePath('/.aistudio/config.json', root), null);
  assert.equal(resolveSafePath('/.github/workflows/validate-mini-apps.yml', root), null);
});

test('portal filtering, pinning, bookmark validation, and recent visits', () => {
  const readerMatches = filterPlaces(PLACES, { query: 'swipe' });
  assert.equal(readerMatches.length, 1);
  assert.equal(readerMatches[0].id, 'pocket-reader');

  const pinned = togglePinned([], 'pocket-notes');
  assert.deepEqual(pinned, ['pocket-notes']);
  const ordered = filterPlaces(PLACES, { pinnedIds: pinned });
  assert.equal(ordered[0].id, 'pocket-notes');

  assert.equal(sanitizeBookmarkUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeBookmarkUrl('data:text/html,hi'), null);
  assert.equal(sanitizeBookmarkUrl('./apps/pocket-notes/index.html'), './apps/pocket-notes/index.html');
  assert.equal(sanitizeBookmarkUrl('https://example.org/page'), 'https://example.org/page');

  const bad = createBookmark({ title: '', url: './x' });
  assert.ok(bad.error);
  const good = createBookmark({ title: 'Reader', url: './apps/pocket-reader/index.html', note: 'Ch 2' }, 100);
  assert.equal(good.bookmark.title, 'Reader');

  const recent = recordRecentVisit([{ id: 'pocket-notes', visitedAt: 1 }], 'pocket-reader', 2);
  assert.equal(recent[0].id, 'pocket-reader');
  assert.equal(recent[1].id, 'pocket-notes');
});

test('Pocket Reader splits Markdown chapters and strips unsafe HTML scripts', () => {
  const parsed = parseDocumentToChapters('# Book Title\n\n## Ch 1\n\nHello world.\n\n## Ch 2\n\nSecond part.', 'book.md');
  assert.equal(parsed.title, 'Book Title');
  assert.equal(parsed.chapters.length, 2);
  assert.equal(parsed.chapters[0].heading, 'Ch 1');
  assert.equal(parsed.chapters[1].paragraphs[0], 'Second part.');

  const safeText = stripHtmlToText('<h1>Safe</h1><script>alert("xss")</script><p>Body &amp; text</p>');
  assert.ok(!safeText.includes('alert'));
  assert.ok(safeText.includes('Body & text'));

  assert.equal(clampChapterIndex(-5, 3), 0);
  assert.equal(clampChapterIndex(99, 3), 2);

  const sample = getSyntheticSampleBook(1000);
  assert.equal(sample.chapters.length, 3);
  const restored = validateShelfBackup({ books: [sample] });
  assert.equal(restored.books.length, 1);
  assert.equal(restored.books[0].chapters.length, 3);
});

test('Pocket Notes manages tags, filtering, safe Markdown blocks, and backup export', () => {
  assert.deepEqual(parseTags('#Local, offline, local, ideas'), ['local', 'offline', 'ideas']);

  const n1 = createNote({ title: 'Alpha', body: '# Heading\n- [x] Done\n> Quote', tags: ['work'] }, 100);
  const n2 = updateNote(createNote({ title: 'Beta', body: 'Hello world', tags: ['home'] }, 200), { pinned: true }, 250);

  const active = filterNotes([n1, n2], {});
  assert.equal(active[0].id, n2.id); // pinned first
  assert.equal(filterNotes([n1, n2], { tag: 'work' }).length, 1);
  assert.equal(noteStats('one two three').words, 3);

  const blocks = parseSafeMarkdownBlocks(n1.body);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[1].type, 'list');
  assert.equal(blocks[1].items[0].checked, true);
  assert.equal(blocks[2].type, 'quote');

  const md = exportNotesToMarkdown([n1, n2]);
  assert.ok(md.includes('# Alpha'));
  const backup = validateNotesBackup({ notes: [n1, n2] });
  assert.equal(backup.notes.length, 2);
});

test('Nsite Directory computes canonical NIP-01 SHA-256 IDs and obeys PI-04 metadata-only boundary', async () => {
  const fixture = await getSyntheticFixtureEvents();
  assert.equal(fixture.length, 5);

  for (const ev of fixture) {
    const shape = validateEventShape(ev);
    assert.equal(shape.valid, true, shape.issues.join('; '));
    const computed = await computeCanonicalEventId(ev);
    assert.equal(computed, ev.id);
  }

  const analysis = await analyzeEventsMetadataOnly(fixture);
  assert.equal(analysis.summary.idMatchedCount, 5);
  assert.equal(analysis.summary.publicationCount, 3); // pubA (2 versions collapsed), pubB mirror, pubC sparse
  assert.equal(analysis.summary.unknownClassificationCount, 1); // pubC sparse metadata MUST remain unknown

  const pubA = analysis.publications.find((p) => p.namespace === 'zine-desk');
  assert.equal(pubA.versionCount, 2);
  assert.equal(pubA.classification, 'zine');

  const pubC = analysis.publications.find((p) => p.kind === 15128);
  assert.equal(pubC.classification, 'unknown');

  // Exact-content manifest stack across pubA and pubB
  const sharedStack = analysis.stacks.find((s) => s.publisherCount === 2);
  assert.ok(sharedStack, 'Expected pubA and pubB to stack by identical manifest fingerprint');

  // NIP-65 relay list rejects non-WebSocket URLs cleanly
  assert.equal(analysis.relayLists.length, 1);
  assert.equal(analysis.relayLists[0].validRelays.length, 3);
  assert.equal(analysis.relayLists[0].invalidEntries.length, 1);

  const sparse = classifyFromMetadataOnly({ title: '', description: '', topics: [], files: [{ path: '/index.html', hash: '1'.repeat(64) }] });
  assert.equal(sparse.classification, 'unknown');

  const parsedRelays = parseRelayListEvent({
    tags: [
      ['r', 'wss://ok.example', 'write'],
      ['r', 'wss://user:pass@bad.example', 'read'],
      ['r', 'wss://ok.example', 'unknown-role'],
    ],
  });
  assert.equal(parsedRelays.validRelays.length, 1);
  assert.equal(parsedRelays.invalidEntries.length, 2);
});

const PALETTE = new Set(['#000000','#FF1493','#FFB6D9','#FFFFFF','#B8B8B8','#111111','#1A1A1A','#C0C0C0','#5E5E5E','#9A0957','#5B0633','#CD0D72']);

test('new portal and standalone app UI chrome uses approved BreBre Colors v0 tokens', () => {
  for (const relative of ['index.html','apps/pocket-reader/skin.css','apps/pocket-notes/skin.css','apps/nsite-directory/skin.css','templates/mini-app/skin.css']) {
    const text = readFileSync(new URL('../' + relative, import.meta.url), 'utf8');
    for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      assert.ok(PALETTE.has(match[0].toUpperCase()), `${relative}: forbidden color ${match[0]}`);
    }
  }
});
