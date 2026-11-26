export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function stripHtmlToText(html) {
  let text = String(html || '');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, _lvl, inner) => `\n\n## ${inner.replace(/<[^>]+>/g, ' ').trim()}\n\n`);
  text = text.replace(/<(?:p|div|li|br|blockquote|section|article|tr)[^>]*>/gi, '\n\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function cleanTitleFromFilename(filename) {
  const base = String(filename || 'Untitled').replace(/\.[^.]+$/, '');
  const cleaned = base.replace(/[_-]+/g, ' ').trim();
  return cleaned || 'Untitled Reading';
}

export function parseDocumentToChapters(rawText, filename = 'Untitled.md') {
  const isHtml = /\.html?$/i.test(filename) || /^\s*<(?:!doctype|html|body|article|div|h1|p)\b/i.test(String(rawText || ''));
  const normalized = isHtml
    ? stripHtmlToText(rawText)
    : String(rawText || '').replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return {
      title: cleanTitleFromFilename(filename),
      chapters: [{ heading: 'Chapter 1', paragraphs: ['This document is empty.'] }],
    };
  }

  let docTitle = cleanTitleFromFilename(filename);
  const lines = normalized.split('\n');
  const chapters = [];
  let currentHeading = '';
  let buffer = [];

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (!body && !currentHeading) return;
    const paragraphs = body
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (paragraphs.length === 0 && !currentHeading) return;
    chapters.push({
      heading: currentHeading || `Section ${chapters.length + 1}`,
      paragraphs: paragraphs.length ? paragraphs : ['(Empty section)'],
    });
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^#{2,3}\s+(.+)$/);
    const rule = /^-{3,}$/.test(line) && buffer.length > 0;

    if (h1 && chapters.length === 0 && buffer.length === 0 && !currentHeading) {
      docTitle = h1[1].trim();
      continue;
    }

    if (h1 || h2) {
      flush();
      currentHeading = (h1 ? h1[1] : h2[1]).trim();
      continue;
    }

    if (rule) {
      flush();
      currentHeading = `Section ${chapters.length + 1}`;
      continue;
    }

    buffer.push(lines[i]);
  }
  flush();

  if (chapters.length === 0) {
    const paragraphs = normalized
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    chapters.push({ heading: docTitle, paragraphs });
  }

  return { title: docTitle, chapters };
}

export function countWords(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function estimateReadingMinutes(chapters) {
  const words = (chapters || []).reduce(
    (sum, ch) => sum + countWords(ch.heading) + (ch.paragraphs || []).reduce((s, p) => s + countWords(p), 0),
    0
  );
  return { words, minutes: Math.max(1, Math.ceil(words / 210)) };
}

export function clampChapterIndex(index, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const n = Math.trunc(Number(index) || 0);
  return Math.min(Math.max(n, 0), total - 1);
}

export function createBookRecord({ title, chapters, sourceName = 'Local text' }, now = Date.now()) {
  const safeChapters = Array.isArray(chapters) && chapters.length
    ? chapters
    : [{ heading: 'Section 1', paragraphs: ['(Empty)'] }];
  const stats = estimateReadingMinutes(safeChapters);
  return {
    id: `book-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: String(title || 'Untitled Reading').trim().slice(0, 120),
    sourceName: String(sourceName || 'Local text').slice(0, 120),
    chapters: safeChapters,
    words: stats.words,
    minutes: stats.minutes,
    chapterIndex: 0,
    scrollTop: 0,
    bookmarks: [],
    addedAt: now,
    lastOpenedAt: now,
  };
}

export function getSyntheticSampleBook(now = Date.now()) {
  const sampleMarkdown = `# Field Guide to Small Offline Places

## 01. Why a Local Shelf Matters
A reader should make room for the words instead of asking you to sign in, upload your files, or stare at cramped chrome. Everything you open here stays on this device in browser local storage.

When you leave a chapter and return later—even after refreshing the page—Pocket Reader opens back to the exact chapter where you stopped.

## 02. Moving Through Chapters
Swipe left or right across the reading surface on a phone, tap the Previous and Next controls at the bottom, or press the Left and Right arrow keys on a keyboard.

When you want an uncluttered page, turn on Focus Mode or scroll down: the top bar steps aside quietly, leaving a single Show Controls button whenever you need typography, chapter jumps, or your shelf again.

## 03. Keeping Your Own Library
This public build starts empty on purpose. Use Import File to add your own Markdown (.md), plain text (.txt), or HTML (.html) readings, or paste notes directly into New Reading.

Use Export Shelf JSON at any time to take a portable backup of your saved books, bookmarks, and reading progress without touching a server.
`;
  const parsed = parseDocumentToChapters(sampleMarkdown, 'Field-Guide-Sample.md');
  return createBookRecord(
    { title: `${parsed.title} (Synthetic Sample)`, chapters: parsed.chapters, sourceName: 'Synthetic sample · not personal data' },
    now
  );
}

export function validateShelfBackup(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.books)) {
    return { error: 'Backup file must be a JSON object containing a books array.' };
  }
  const books = [];
  for (const item of payload.books) {
    if (!item || typeof item !== 'object' || !Array.isArray(item.chapters) || item.chapters.length === 0) {
      continue;
    }
    const chapters = item.chapters
      .filter((ch) => ch && typeof ch.heading === 'string' && Array.isArray(ch.paragraphs))
      .map((ch) => ({
        heading: ch.heading.slice(0, 140),
        paragraphs: ch.paragraphs.map((p) => String(p)).filter(Boolean),
      }));
    if (!chapters.length) continue;
    const stats = estimateReadingMinutes(chapters);
    books.push({
      id: typeof item.id === 'string' && item.id ? item.id : `book-${Date.now()}-${books.length}`,
      title: String(item.title || 'Imported Reading').slice(0, 120),
      sourceName: String(item.sourceName || 'Imported backup').slice(0, 120),
      chapters,
      words: stats.words,
      minutes: stats.minutes,
      chapterIndex: clampChapterIndex(item.chapterIndex, chapters.length),
      scrollTop: Math.max(0, Number(item.scrollTop) || 0),
      bookmarks: Array.isArray(item.bookmarks)
        ? [...new Set(item.bookmarks.map((n) => clampChapterIndex(n, chapters.length)))]
        : [],
      addedAt: Number(item.addedAt) || Date.now(),
      lastOpenedAt: Number(item.lastOpenedAt) || Date.now(),
    });
  }
  if (!books.length) {
    return { error: 'No valid books found in backup file.' };
  }
  return { books };
}
