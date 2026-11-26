export const PLACES = [
  {
    id: 'pocket-reader',
    name: 'Pocket Reader',
    href: './apps/pocket-reader/index.html',
    category: 'everyday',
    categoryLabel: 'Everyday tool',
    status: 'testing',
    evidence: 'Browser-tested · Offline · Local shelf',
    summary: 'Read local Markdown, text, and HTML chapters with swipe navigation, scroll-hiding focus mode, adjustable typography, and saved reading position.',
    storage: 'localStorage',
    workstream: 'C · Real App Store',
  },
  {
    id: 'pocket-notes',
    name: 'Pocket Notes',
    href: './apps/pocket-notes/index.html',
    category: 'everyday',
    categoryLabel: 'Everyday tool',
    status: 'testing',
    evidence: 'Browser-tested · Offline · Local backup',
    summary: 'Capture notes, filter by tag or search, preview Markdown, pin essentials, undo deletes, and export portable JSON or Markdown backups.',
    storage: 'localStorage',
    workstream: 'E · Personal Workspace',
  },
  {
    id: 'nsite-directory',
    name: 'Nsite Directory',
    href: './apps/nsite-directory/index.html',
    category: 'protocol',
    categoryLabel: 'Metadata tool',
    status: 'testing',
    evidence: 'Browser-tested · Metadata-only (PI-04)',
    summary: 'Inspect NIP-01 and nsite event metadata, verify canonical SHA-256 event IDs, stack identical manifests, and classify strictly without remote site fetching.',
    storage: 'localStorage',
    workstream: 'D · Linked Little Web',
  },
  {
    id: 'folder-launcher',
    name: 'Folder Launcher',
    href: './apps/folder-launcher/web2app/index.html',
    category: 'launcher',
    categoryLabel: 'Launcher',
    status: 'live',
    evidence: 'Owner-attested Android APK · Web fallback here',
    summary: 'Open standalone HTML pages and ZIP websites from a device folder without unpacking. Here runs the HTML fallback; native Android source lives in the repo.',
    storage: 'IndexedDB',
    workstream: 'G · Connected World',
  },
  {
    id: 'nsite-archive',
    name: 'Nsite Archive',
    href: './apps/nsite-archive/index.html',
    category: 'archive',
    categoryLabel: 'Archive tool',
    status: 'testing',
    evidence: '16 unit tests · Separate archival workflow',
    summary: 'Independent browser archive for preserved signed nsite collections, full-text search, version history comparison, and lossless backup restoration.',
    storage: 'IndexedDB',
    workstream: 'A · Artifact Archive',
  },
  {
    id: 'pocket-counter',
    name: 'Pocket Counter',
    href: './templates/mini-app/index.html',
    category: 'template',
    categoryLabel: 'Template',
    status: 'wip',
    evidence: 'Starter example · Not Android-verified',
    summary: 'Minimal offline mini-app template demonstrating semantic skins, in-app Help, and local storage persistence without a framework.',
    storage: 'localStorage',
    workstream: 'F · Studio Standards',
  },
];

export const WORKSTREAMS = [
  {
    code: 'A',
    name: 'HERE YOU GO',
    focus: 'Understandable, status-labelled artifact catalogs that let humans correct mistakes.',
  },
  {
    code: 'B',
    name: 'Baby Internet',
    focus: 'Small local testnets for exercising multi-client behavior before public hosting.',
  },
  {
    code: 'C',
    name: 'Real App Store',
    focus: 'Standalone apps proven by real Find → Open → Use → Keep → Return tasks.',
  },
  {
    code: 'D',
    name: 'Linked Little Web',
    focus: 'Independent sites, portable publishing, and strictly metadata-only discovery.',
  },
  {
    code: 'E',
    name: "Melody's Room",
    focus: 'Personal, persistent workspaces you can inhabit, close, and return to.',
  },
  {
    code: 'F',
    name: 'Pretend Internet Studio',
    focus: 'Inspect, repair, validate, and maintain independent projects without duplicates.',
  },
  {
    code: 'G',
    name: 'Connected World',
    focus: 'Two or more useful places reachable from one honest, understandable doorway.',
  },
];

export function filterPlaces(places, { query = '', category = 'all', pinnedIds = [] } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const pinnedSet = new Set(pinnedIds);

  return places
    .filter((place) => {
      if (category === 'pinned') {
        if (!pinnedSet.has(place.id)) return false;
      } else if (category !== 'all' && place.category !== category) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        place.name,
        place.summary,
        place.categoryLabel,
        place.status,
        place.evidence,
        place.workstream,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => {
      const aPinned = pinnedSet.has(a.id) ? 1 : 0;
      const bPinned = pinnedSet.has(b.id) ? 1 : 0;
      return bPinned - aPinned;
    });
}

export function sanitizeBookmarkUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('./') || trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

export function createBookmark({ title, url, note = '' }, now = Date.now()) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) {
    return { error: 'Enter a bookmark title.' };
  }
  const cleanUrl = sanitizeBookmarkUrl(url);
  if (!cleanUrl) {
    return { error: 'Enter a valid relative path (./...) or http(s) URL.' };
  }
  return {
    bookmark: {
      id: `bm-${now}-${Math.random().toString(36).slice(2, 7)}`,
      title: cleanTitle.slice(0, 80),
      url: cleanUrl,
      note: String(note || '').trim().slice(0, 180),
      createdAt: now,
    },
  };
}

export function togglePinned(pinnedIds, id) {
  const list = Array.isArray(pinnedIds) ? [...pinnedIds] : [];
  const idx = list.indexOf(id);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift(id);
  }
  return list;
}

export function recordRecentVisit(recentVisits, placeId, now = Date.now(), maxItems = 6) {
  const list = Array.isArray(recentVisits) ? recentVisits.filter((item) => item && item.id !== placeId) : [];
  list.unshift({ id: placeId, visitedAt: now });
  return list.slice(0, maxItems);
}
