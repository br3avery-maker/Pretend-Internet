const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_128 = /^[0-9a-f]{128}$/;

function hasLoneSurrogate(str) {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = str.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function validateEventShape(event) {
  const issues = [];
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { valid: false, issues: ['Event must be a JSON object'] };
  }
  if (typeof event.pubkey !== 'string' || !HEX_64.test(event.pubkey)) {
    issues.push('pubkey must be 64 lowercase hex characters');
  }
  if (!Number.isSafeInteger(event.created_at) || event.created_at < 0) {
    issues.push('created_at must be a non-negative Unix timestamp in seconds');
  }
  if (!Number.isSafeInteger(event.kind) || event.kind < 0 || event.kind > 65535) {
    issues.push('kind must be an integer between 0 and 65535');
  }
  if (typeof event.content !== 'string' || hasLoneSurrogate(event.content)) {
    issues.push('content must be a valid UTF-8 string');
  }
  if (!Array.isArray(event.tags)) {
    issues.push('tags must be an array of string arrays');
  } else {
    for (const tag of event.tags) {
      if (!Array.isArray(tag) || tag.some((item) => typeof item !== 'string' || hasLoneSurrogate(item))) {
        issues.push('every tag must be an array of valid UTF-8 strings');
        break;
      }
    }
  }
  if (event.id !== undefined && (typeof event.id !== 'string' || !HEX_64.test(event.id))) {
    issues.push('id must be 64 lowercase hex characters when present');
  }
  if (event.sig !== undefined && (typeof event.sig !== 'string' || !HEX_128.test(event.sig))) {
    issues.push('sig must be 128 lowercase hex characters when present');
  }
  return { valid: issues.length === 0, issues };
}

export async function computeCanonicalEventId(event) {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return sha256Hex(serialized);
}

export function kindPersistenceCategory(kind) {
  if (kind === 0 || kind === 3 || (kind >= 10000 && kind <= 19999)) return 'replaceable';
  if (kind >= 20000 && kind <= 29999) return 'ephemeral';
  if (kind >= 30000 && kind <= 39999) return 'addressable';
  return 'regular';
}

export function parseRelayListEvent(event) {
  const validRelays = [];
  const invalidEntries = [];
  const seen = new Set();

  for (const tag of event.tags || []) {
    if (tag[0] !== 'r') continue;
    const rawUrl = tag[1] || '';
    const marker = tag[2];
    if (marker !== undefined && marker !== '' && marker !== 'read' && marker !== 'write') {
      invalidEntries.push({ rawUrl, reason: `Unknown role marker "${marker}"` });
      continue;
    }
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      invalidEntries.push({ rawUrl, reason: 'Malformed URL' });
      continue;
    }
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') {
      invalidEntries.push({ rawUrl, reason: `Unsupported scheme ${parsed.protocol}` });
      continue;
    }
    if (parsed.username || parsed.password || parsed.hash) {
      invalidEntries.push({ rawUrl, reason: 'Credentials or fragments are not allowed' });
      continue;
    }
    const role = marker === 'read' || marker === 'write' ? marker : 'both';
    const key = `${parsed.href}|${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    validRelays.push({ url: parsed.href, role });
  }
  return { validRelays, invalidEntries };
}

export function parseJsonEventsInput(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return { error: 'Paste or import JSON event data first.', events: [] };
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return { events: parsed };
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.events)) return { events: parsed.events };
    if (parsed && typeof parsed === 'object') return { events: [parsed] };
  } catch {
    // Try NDJSON (one JSON event per line)
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const events = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        return { error: 'Input is neither valid JSON nor line-delimited JSON (NDJSON).', events: [] };
      }
    }
    return { events };
  }
  return { error: 'Unsupported JSON structure.', events: [] };
}

function firstTagValue(tags, name) {
  const found = (tags || []).find((t) => t[0] === name && typeof t[1] === 'string' && t[1].trim());
  return found ? found[1].trim() : '';
}

function allTagValues(tags, name) {
  return [...new Set((tags || []).filter((t) => t[0] === name && typeof t[1] === 'string' && t[1].trim()).map((t) => t[1].trim()))];
}

export function classifyFromMetadataOnly({ title, description, topics, files }) {
  // PI-04 boundary: classify strictly from declared event metadata; leave insufficient metadata as unknown.
  if (topics.length > 0) {
    return { classification: topics[0].toLowerCase(), basis: 'declared t tag' };
  }
  if (!title && !description) {
    return { classification: 'unknown', basis: 'insufficient event metadata (remote fetching disabled)' };
  }
  const hasHtml = files.some((f) => /\.html?$/i.test(f.path));
  const hasAudio = files.some((f) => /\.(mp3|ogg|wav|flac)$/i.test(f.path));
  const hasImages = files.some((f) => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f.path));
  if (hasHtml && hasAudio) return { classification: 'media-site', basis: 'declared title/description + declared file paths' };
  if (hasHtml && hasImages) return { classification: 'visual-site', basis: 'declared title/description + declared file paths' };
  if (hasHtml) return { classification: 'web-document', basis: 'declared title/description + declared HTML path' };
  return { classification: 'unknown', basis: 'declared metadata does not identify site type' };
}

export async function analyzeEventsMetadataOnly(rawEvents) {
  const inspected = [];
  const relayLists = [];
  const legacyBuckets = new Map();
  const manifestEvents = [];

  for (const ev of rawEvents || []) {
    const shape = validateEventShape(ev);
    let computedId = null;
    let idMatches = false;
    if (shape.valid) {
      computedId = await computeCanonicalEventId(ev);
      idMatches = ev.id ? ev.id === computedId : false;
    }
    const record = {
      raw: ev,
      validShape: shape.valid,
      issues: shape.issues,
      computedId,
      idMatches,
      signatureVerified: false, // Explicit: structural + canonical ID check only; no BIP-340 verify here.
      persistence: shape.valid ? kindPersistenceCategory(ev.kind) : 'invalid',
    };
    inspected.push(record);

    if (!shape.valid) continue;

    if (ev.kind === 10002) {
      relayLists.push({
        pubkey: ev.pubkey,
        createdAt: ev.created_at,
        id: ev.id || computedId,
        ...parseRelayListEvent(ev),
      });
      continue;
    }

    if (ev.kind === 15128 || ev.kind === 35128) {
      manifestEvents.push(record);
      continue;
    }

    if (ev.kind === 34128) {
      const path = firstTagValue(ev.tags, 'd');
      const hash = firstTagValue(ev.tags, 'x');
      if (!path) continue;
      const key = `${ev.pubkey}::root`;
      if (!legacyBuckets.has(key)) {
        legacyBuckets.set(key, { pubkey: ev.pubkey, namespace: 'root (kind 34128)', files: new Map(), latestAt: 0, eventIds: [] });
      }
      const bucket = legacyBuckets.get(key);
      bucket.latestAt = Math.max(bucket.latestAt, ev.created_at);
      bucket.eventIds.push(ev.id || computedId);
      const existing = bucket.files.get(path);
      if (!existing || ev.created_at > existing.createdAt || (ev.created_at === existing.createdAt && (ev.id || computedId) < existing.eventId)) {
        bucket.files.set(path, {
          path,
          hash: HEX_64.test(hash) ? hash : 'undeclared',
          createdAt: ev.created_at,
          eventId: ev.id || computedId,
        });
      }
    }
  }

  // Group manifest events by (pubkey, namespace) into version chains
  const publicationGroups = new Map();
  for (const rec of manifestEvents) {
    const ev = rec.raw;
    const namespace = ev.kind === 35128 ? (firstTagValue(ev.tags, 'd') || '(empty d-tag)') : 'root (kind 15128)';
    const groupKey = `${ev.pubkey}::${ev.kind}::${namespace}`;
    if (!publicationGroups.has(groupKey)) {
      publicationGroups.set(groupKey, []);
    }
    publicationGroups.get(groupKey).push(rec);
  }

  const publications = [];

  for (const [, versions] of publicationGroups.entries()) {
    // NIP-01 replaceable/addressable ordering: newest created_at wins, tie-break lowest lexicographic id
    versions.sort((a, b) => {
      if (b.raw.created_at !== a.raw.created_at) return b.raw.created_at - a.raw.created_at;
      const idA = a.raw.id || a.computedId || '';
      const idB = b.raw.id || b.computedId || '';
      return idA.localeCompare(idB);
    });
    const latest = versions[0].raw;
    const files = (latest.tags || [])
      .filter((t) => t[0] === 'path' && typeof t[1] === 'string' && t[1].trim())
      .map((t) => ({
        path: t[1].trim(),
        hash: typeof t[2] === 'string' && HEX_64.test(t[2]) ? t[2] : 'undeclared',
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    const title = firstTagValue(latest.tags, 'title');
    const description = firstTagValue(latest.tags, 'description');
    const topics = allTagValues(latest.tags, 't');
    const namespace = latest.kind === 35128 ? (firstTagValue(latest.tags, 'd') || '(empty d-tag)') : 'root';
    const fingerprintInput = files.map((f) => `${f.path}=${f.hash}`).join('\n');
    const manifestFingerprint = files.length && files.every((file) => HEX_64.test(file.hash))
      ? await sha256Hex(fingerprintInput) : null;
    const metaClass = classifyFromMetadataOnly({ title, description, topics, files });

    publications.push({
      id: `${latest.pubkey.slice(0, 12)}:${namespace}`,
      pubkey: latest.pubkey,
      kind: latest.kind,
      namespace,
      title: title || '(Untitled — metadata absent)',
      hasDeclaredTitle: Boolean(title),
      description: description || 'No description declared in event metadata.',
      topics,
      classification: metaClass.classification,
      classificationBasis: metaClass.basis,
      files,
      manifestFingerprint,
      latestEventId: latest.id || versions[0].computedId,
      latestCreatedAt: latest.created_at,
      idMatches: versions[0].idMatches,
      versionCount: versions.length,
      versions: versions.map((v) => ({
        eventId: v.raw.id || v.computedId,
        createdAt: v.raw.created_at,
        idMatches: v.idMatches,
      })),
    });
  }

  for (const [, bucket] of legacyBuckets.entries()) {
    const files = [...bucket.files.values()].sort((a, b) => a.path.localeCompare(b.path));
    const fingerprintInput = files.map((f) => `${f.path}=${f.hash}`).join('\n');
    const manifestFingerprint = files.length && files.every((file) => HEX_64.test(file.hash))
      ? await sha256Hex(fingerprintInput) : null;
    const metaClass = classifyFromMetadataOnly({ title: '', description: '', topics: [], files });
    publications.push({
      id: `${bucket.pubkey.slice(0, 12)}:legacy`,
      pubkey: bucket.pubkey,
      kind: 34128,
      namespace: bucket.namespace,
      title: '(Untitled — kind 34128 file set)',
      hasDeclaredTitle: false,
      description: 'Legacy per-path nsite events declare paths and hashes only; remote HTML is not fetched.',
      topics: [],
      classification: metaClass.classification,
      classificationBasis: metaClass.basis,
      files,
      manifestFingerprint,
      latestEventId: bucket.eventIds[0],
      latestCreatedAt: bucket.latestAt,
      idMatches: true,
      versionCount: 1,
      versions: [{ eventId: bucket.eventIds[0], createdAt: bucket.latestAt, idMatches: true }],
    });
  }

  // Stack exact-content deployments by manifestFingerprint across publishers
  const stacksByFingerprint = new Map();
  for (const pub of publications) {
    if (!pub.manifestFingerprint) continue;
    if (!stacksByFingerprint.has(pub.manifestFingerprint)) {
      stacksByFingerprint.set(pub.manifestFingerprint, []);
    }
    stacksByFingerprint.get(pub.manifestFingerprint).push(pub);
  }

  const stacks = [...stacksByFingerprint.entries()].map(([fingerprint, members]) => ({
    fingerprint,
    members: members.sort((a, b) => b.latestCreatedAt - a.latestCreatedAt),
    publisherCount: new Set(members.map((m) => m.pubkey)).size,
  }));

  return {
    inspected,
    publications: publications.sort((a, b) => b.latestCreatedAt - a.latestCreatedAt),
    stacks,
    relayLists,
    summary: {
      totalEvents: inspected.length,
      validShapeCount: inspected.filter((e) => e.validShape).length,
      idMatchedCount: inspected.filter((e) => e.idMatches).length,
      publicationCount: publications.length,
      unknownClassificationCount: publications.filter((p) => p.classification === 'unknown').length,
      relayListCount: relayLists.length,
    },
  };
}

export async function getSyntheticFixtureEvents() {
  const pubA = 'a'.repeat(64);
  const pubB = 'b'.repeat(64);
  const pubC = 'c'.repeat(64);
  const fakeSig = '0'.repeat(128);
  const hashIndex = '1'.repeat(64);
  const hashStyle = '2'.repeat(64);
  const hashOld = '3'.repeat(64);
  const hashSparse = '4'.repeat(64);

  const templates = [
    {
      pubkey: pubA,
      created_at: 1762900000,
      kind: 35128,
      tags: [
        ['d', 'zine-desk'],
        ['title', 'Small Offline Zine'],
        ['description', 'Static essays and monochrome sketches packaged as a named nsite.'],
        ['t', 'zine'],
        ['t', 'offline'],
        ['path', '/index.html', hashIndex],
        ['path', '/style.css', hashStyle],
      ],
      content: '',
    },
    {
      pubkey: pubA,
      created_at: 1762800000,
      kind: 35128,
      tags: [
        ['d', 'zine-desk'],
        ['title', 'Small Offline Zine'],
        ['description', 'Earlier draft revision.'],
        ['t', 'zine'],
        ['path', '/index.html', hashOld],
      ],
      content: '',
    },
    {
      pubkey: pubB,
      created_at: 1762910000,
      kind: 35128,
      tags: [
        ['d', 'zine-mirror'],
        ['title', 'Small Offline Zine (Mirror)'],
        ['description', 'Independent publisher declaring the exact same path-to-hash manifest.'],
        ['t', 'zine'],
        ['path', '/index.html', hashIndex],
        ['path', '/style.css', hashStyle],
      ],
      content: '',
    },
    {
      pubkey: pubC,
      created_at: 1762920000,
      kind: 15128,
      tags: [
        ['path', '/index.html', hashSparse],
      ],
      content: '',
    },
    {
      pubkey: pubA,
      created_at: 1762925000,
      kind: 10002,
      tags: [
        ['r', 'wss://relay.example.org', 'write'],
        ['r', 'wss://inbox.example.org', 'read'],
        ['r', 'wss://both.example.org'],
        ['r', 'https://not-a-ws.example.org', 'read'],
      ],
      content: '',
    },
  ];

  const events = [];
  for (const tpl of templates) {
    const id = await computeCanonicalEventId(tpl);
    events.push({ ...tpl, id, sig: fakeSig });
  }
  return events;
}
