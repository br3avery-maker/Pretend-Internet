export function parseTags(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((t) => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 12);
  }
  return [
    ...new Set(
      String(raw || '')
        .split(/[,\s]+/)
        .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean)
    ),
  ].slice(0, 12);
}

export function noteStats(body) {
  const text = String(body || '');
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    words,
    chars: text.length,
    minutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / 200)),
  };
}

export function createNote({ title = '', body = '', tags = [] } = {}, now = Date.now()) {
  return {
    id: `note-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: String(title || '').trim().slice(0, 120),
    body: String(body || ''),
    tags: parseTags(tags),
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateNote(note, patch = {}, now = Date.now()) {
  return {
    ...note,
    title: patch.title !== undefined ? String(patch.title).slice(0, 120) : note.title,
    body: patch.body !== undefined ? String(patch.body) : note.body,
    tags: patch.tags !== undefined ? parseTags(patch.tags) : note.tags,
    pinned: patch.pinned !== undefined ? Boolean(patch.pinned) : note.pinned,
    archived: patch.archived !== undefined ? Boolean(patch.archived) : note.archived,
    updatedAt: now,
  };
}

export function collectTags(notes) {
  const counts = new Map();
  for (const n of notes || []) {
    if (n.archived) continue;
    for (const tag of n.tags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}

export function filterNotes(notes, { query = '', tag = '', showArchived = false } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const t = String(tag || '').trim().toLowerCase();
  return (notes || [])
    .filter((note) => {
      if (Boolean(note.archived) !== Boolean(showArchived)) return false;
      if (t && !(note.tags || []).includes(t)) return false;
      if (!q) return true;
      const haystack = `${note.title}\n${note.body}\n${(note.tags || []).join(' ')}`.toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => {
      const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      if (pinDiff !== 0) return pinDiff;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
}

export function parseSafeMarkdownBlocks(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let inCode = false;
  let codeLines = [];
  let listItems = [];

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: 'list', items: listItems });
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('```')) {
      flushList();
      if (inCode) {
        blocks.push({ type: 'code', text: codeLines.join('\n') });
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }
    if (!trimmed) {
      flushList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      continue;
    }
    const check = trimmed.match(/^[-*]\s+\[( |x|X)\]\s+(.+)$/);
    if (check) {
      listItems.push({ kind: 'check', checked: check[1].toLowerCase() === 'x', text: check[2].trim() });
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      listItems.push({ kind: 'bullet', text: bullet[1].trim() });
      continue;
    }
    const quote = trimmed.match(/^>\s+(.+)$/);
    if (quote) {
      flushList();
      blocks.push({ type: 'quote', text: quote[1].trim() });
      continue;
    }
    flushList();
    blocks.push({ type: 'paragraph', text: trimmed });
  }

  if (inCode && codeLines.length) {
    blocks.push({ type: 'code', text: codeLines.join('\n') });
  }
  flushList();
  return blocks;
}

export function exportNotesToMarkdown(notes) {
  return (notes || [])
    .map((n) => {
      const heading = `# ${n.title || 'Untitled Note'}`;
      const meta = n.tags?.length ? `Tags: ${n.tags.join(', ')}\n` : '';
      return `${heading}\n${meta}\n${n.body || ''}`.trim();
    })
    .join('\n\n---\n\n');
}

export function validateNotesBackup(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.notes)) {
    return { error: 'Backup file must contain a notes array.' };
  }
  const notes = [];
  for (const item of payload.notes) {
    if (!item || typeof item !== 'object') continue;
    notes.push({
      id: typeof item.id === 'string' && item.id ? item.id : `note-${Date.now()}-${notes.length}`,
      title: String(item.title || '').slice(0, 120),
      body: String(item.body || ''),
      tags: parseTags(item.tags || []),
      pinned: Boolean(item.pinned),
      archived: Boolean(item.archived),
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now(),
    });
  }
  return { notes };
}
