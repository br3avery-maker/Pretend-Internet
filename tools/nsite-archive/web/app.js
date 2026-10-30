/* No framework, third-party scripts, signer access, or remote previews. */
const $ = (id) => document.getElementById(id);
let data = null,
  view = 'sites',
  limit = 50,
  directoryScroll = 0,
  detailActive = false;
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const title = (s) => s.published.title || s.derived.title || 'Untitled site';
const short = (s) => s.slice(0, 12) + '…' + s.slice(-8);
const date = (n) => new Date(n * 1000).toLocaleDateString();
const link = (text, href) => {
  const a = el('a', text);
  a.href = href;
  return a;
};
const internal = (s) => link(title(s), '#site=' + encodeURIComponent(s.site));
const safeURL = (value) => {
  try {
    const u = new URL(value);
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
};
function preview(value) {
  return /^previews\/[0-9a-f]{64}\.png$/.test(value ?? '') ? value : null;
}
function message(text, error = false) {
  $('message').textContent = text;
  $('message').className = error ? 'error' : '';
}
function load(value) {
  const strings = (x, keys) => x && keys.every((k) => typeof x[k] === 'string');
  if (
    value?.schema !== 'nsite-archive.v1' ||
    !Array.isArray(value.sites) ||
    !Array.isArray(value.publishers) ||
    !Array.isArray(value.groups) ||
    !Array.isArray(value.discovery) ||
    !value.stats ||
    !Array.isArray(value.stats.jobs) ||
    !['sites', 'publishers', 'uniqueContent', 'hidden'].every(
      (k) => Number.isSafeInteger(value.stats[k]) && value.stats[k] >= 0,
    ) ||
    value.sites.some(
      (s) =>
        !strings(s, ['site', 'publisher', 'head', 'aggregate', 'identifier']) ||
        !strings(s.published, ['title', 'description']) ||
        !strings(s.derived, ['title', 'description']) ||
        !Array.isArray(s.pages) ||
        !Array.isArray(s.relations) ||
        !Array.isArray(s.sources) ||
        !Array.isArray(s.filterReasons) ||
        !Array.isArray(s.versions) ||
        !s.versions.length ||
        s.versions.some((v) => !strings(v, ['id', 'aggregate']) || !Array.isArray(v.files)) ||
        s.pages.some(
          (p) =>
            !strings(p, ['path', 'hash', 'title', 'text', 'description']) ||
            !Array.isArray(p.headings) ||
            !Array.isArray(p.links) ||
            !Array.isArray(p.subjects),
        ),
    ) ||
    value.groups.some(
      (g) => !Array.isArray(g.members) || g.members.some((m) => typeof m !== 'string'),
    )
  )
    throw Error('This is not a supported nsite archive export.');
  data = value;
  $('export').disabled = false;
  $('counts').textContent =
    `${data.stats.sites.toLocaleString()} sites · ${data.stats.publishers.toLocaleString()} publishers · ${data.stats.uniqueContent.toLocaleString()} distinct file trees`;
  $('stamp').textContent = 'Indexed ' + date(data.generatedAt);
  const pending = data.stats.jobs
      .filter((j) => j.state !== 'complete')
      .reduce((s, j) => s + j.count, 0),
    incomplete = data.discovery.filter((d) => d.status !== 'complete').length;
  message(
    `${pending ? `${pending} assets still queued or unavailable. ` : ''}${incomplete ? `${incomplete} relay scans have remaining work or coverage gaps. ` : ''}${data.unindexed?.length ? `${data.unindexed.length} signed manifests preserved with indexing errors. ` : ''}${data.indexing?.pending ? `${data.indexing.pending} archived pages await indexing. ` : ''}${data.indexing?.failures?.length ? `${data.indexing.failures.length} page extraction failures retained for retry. ` : ''}${data.stats.hidden ? `${data.stats.hidden} sites match reversible filters.` : ''}`.trim(),
  );
  render();
  route();
}
function filtered() {
  const q = $('search').value.toLocaleLowerCase().trim();
  return data.sites.filter(
    (s) =>
      ($('filtered').checked || !s.hidden) &&
      (!q ||
        [
          title(s),
          s.published.description,
          s.derived.description,
          s.publisher,
          s.identifier,
          ...s.pages.map((p) => p.path + ' ' + p.title + ' ' + p.text),
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(q)),
  );
}
function siteRow(s) {
  const row = el('article', undefined, 'site' + (s.hidden ? ' filtered' : '')),
    body = el('div', undefined, 'body'),
    h = el('h2');
  h.append(internal(s));
  body.append(h);
  const p = preview(s.versions.find((v) => v.id === s.head)?.preview);
  if (p) {
    const img = el('img');
    img.src = p;
    img.alt = 'Archived static preview of ' + title(s);
    img.className = 'thumb';
    img.loading = 'lazy';
    row.append(img);
  }
  body.append(
    el(
      'p',
      (s.published.description || s.derived.description || 'Content not indexed yet.').slice(
        0,
        240,
      ),
    ),
  );
  body.append(
    el(
      'p',
      `${s.identifier || 'root'} · ${short(s.publisher)} · ${s.pages.length} indexed pages · ${s.versions.length} versions`,
      'meta',
    ),
  );
  body.append(
    el(
      'p',
      `${s.versions.find((v) => v.id === s.head)?.status ?? 'partial'} archive · ${date(s.versions.find((v) => v.id === s.head)?.created ?? 0)}${s.published.title ? '' : ' · title extracted from content'}`,
      'meta',
    ),
  );
  if (s.hidden)
    body.append(
      el(
        'p',
        s.filterReasons.map((r) => r.reason).join('; ') || 'Hidden by local decision',
        'reason',
      ),
    );
  row.append(body);
  return row;
}
function render() {
  if (!data) return;
  const result = $('results');
  result.replaceChildren();
  let sites = filtered();
  const count = new Map(data.publishers.map((p) => [p.pubkey, p.siteCount]));
  sites.sort((a, b) =>
    $('sort').value === 'title'
      ? title(a).localeCompare(title(b))
      : $('sort').value === 'publisher'
        ? count.get(b.publisher) - count.get(a.publisher) || title(a).localeCompare(title(b))
        : $('sort').value === 'pages'
          ? b.pages.length - a.pages.length || title(a).localeCompare(title(b))
          : b.versions[0].created - a.versions[0].created || a.site.localeCompare(b.site),
  );
  let total;
  if (view === 'sites') {
    total = sites.length;
    for (const s of sites.slice(0, limit)) result.append(siteRow(s));
  } else if (view === 'publishers') {
    const groups = new Map();
    for (const s of sites) {
      if (!groups.has(s.publisher)) groups.set(s.publisher, []);
      groups.get(s.publisher).push(s);
    }
    const entries = [...groups].sort((a, b) =>
      $('sort').value === 'publisher'
        ? count.get(b[0]) - count.get(a[0])
        : a[0].localeCompare(b[0]),
    );
    total = entries.length;
    for (const [pubkey, members] of entries.slice(0, limit)) {
      const d = el('details'),
        summary = el(
          'summary',
          `${short(pubkey)} · ${count.get(pubkey)} sites in archive${members.length !== count.get(pubkey) ? ` · ${members.length} shown` : ''}`,
        );
      d.append(summary, el('code', pubkey));
      d.addEventListener('toggle', () => {
        if (d.open && !d.dataset.filled) {
          for (const s of members) d.append(siteRow(s));
          d.dataset.filled = '1';
        }
      });
      result.append(d);
    }
  } else {
    const visible = new Set(sites.map((s) => s.site)),
      groups = data.groups.filter((g) => g.members.some((m) => visible.has(m)));
    total = groups.length;
    for (const g of groups.slice(0, limit)) {
      const d = el('details'),
        label =
          g.type === 'identical-content'
            ? 'Identical file trees'
            : g.type === 'declared-family'
              ? 'Publisher-declared family'
              : 'Probable clones';
      d.append(el('summary', `${label} · ${g.members.length} sites`));
      d.append(
        el(
          'p',
          g.type === 'identical-content'
            ? 'Same native aggregate hash; this does not establish which site came first.'
            : g.type === 'declared-family'
              ? 'Related by signed origin claims. Source lineage is not independently verified.'
              : `File-hash similarity ${Math.round(g.score * 100)}%; lineage unverified.`,
          'muted',
        ),
      );
      for (const id of g.members) {
        const s = data.sites.find((x) => x.site === id);
        if (s && visible.has(id)) d.append(siteRow(s));
      }
      result.append(d);
    }
    if (data.similarityLimited)
      result.append(
        el(
          'p',
          'Similarity comparisons reached their cap. Every archived site remains searchable.',
          'muted',
        ),
      );
  }
  $('result-count').textContent =
    `${total.toLocaleString()} ${view === 'sites' ? 'sites' : view === 'publishers' ? 'publishers' : 'groups'}${total > limit ? ` · showing ${Math.min(limit, total)}` : ''}`;
  $('more').hidden = total <= limit;
  if (!total)
    result.append(
      el(
        'p',
        data.sites.length
          ? 'No matches. Try another search or show filtered sites.'
          : 'No sites yet. Import an index after the archive worker collects or imports signed manifests.',
        'empty',
      ),
    );
}
function route() {
  const params = new URLSearchParams(location.hash.slice(1)),
    id = params.get('site');
  if (!id || !data) {
    $('directory').hidden = false;
    $('detail').hidden = true;
    if (detailActive) {
      detailActive = false;
      requestAnimationFrame(() => window.scrollTo(0, directoryScroll));
    }
    return;
  }
  const s = data.sites.find((x) => x.site === id);
  if (!s) return;
  if (!detailActive) directoryScroll = window.scrollY;
  detailActive = true;
  const root = $('detail');
  root.replaceChildren();
  $('directory').hidden = true;
  root.hidden = false;
  window.scrollTo(0, 0);
  const back = el('button', '← Back to collection');
  back.onclick = () => {
    location.hash = '';
  };
  root.append(
    back,
    el('h1', title(s)),
    el('p', s.published.description || s.derived.description || 'No description available.'),
  );
  const url = safeURL(s.url);
  if (url) {
    const a = link('Open public site ↗', url);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    root.append(a);
  }
  const d = el('dl');
  for (const [key, value] of [
    ['Publisher', s.publisher],
    ['Namespace', s.site],
    ['Archive', s.observation],
    ['Published title', s.published.title || '(not supplied)'],
    ['Derived title', s.derived.title || '(not extracted)'],
    ['Content hash', s.aggregate],
  ])
    d.append(el('dt', key), el('dd', value));
  root.append(d);
  const p = preview(s.versions.find((v) => v.id === s.head)?.preview);
  if (p) {
    const img = el('img');
    img.src = p;
    img.alt = 'Static archived preview';
    img.className = 'preview';
    root.append(img);
  }
  if (s.filterReasons.length)
    root.append(
      el(
        'p',
        'Filter evidence: ' + s.filterReasons.map((r) => `${r.rule}: ${r.reason}`).join('; '),
        'reason',
      ),
    );
  root.append(el('h2', `${s.pages.length} indexed pages`));
  for (const page of s.pages) {
    const section = el('details');
    section.append(
      el('summary', (page.title || page.headings[0] || page.path) + ' · ' + page.path),
      el('p', page.description || page.text.slice(0, 240)),
      el('pre', page.text),
    );
    if (page.language)
      section.append(el('p', 'Language: ' + page.language.value + ' (HTML declaration)', 'muted'));
    if (page.subjects.length)
      section.append(
        el('p', 'Subject candidates: ' + page.subjects.map((x) => x.value).join(', '), 'muted'),
      );
    const links = el('details');
    links.append(el('summary', `${page.links.length} extracted links`));
    for (const x of page.links) {
      const safe = safeURL(x.href);
      links.append(el('p', `${x.text || x.href} → ${safe || x.href}`));
    }
    section.append(links, el('code', 'File SHA-256: ' + page.hash));
    root.append(section);
  }
  root.append(el('h2', `${s.versions.length} preserved versions`));
  if (s.versions.length > 1) {
    const form = el('form'),
      a = el('select'),
      b = el('select');
    a.setAttribute('aria-label', 'Before version');
    b.setAttribute('aria-label', 'After version');
    for (const v of s.versions) {
      a.append(new Option(date(v.created) + ' ' + v.id.slice(0, 10), v.id));
      b.append(new Option(date(v.created) + ' ' + v.id.slice(0, 10), v.id));
    }
    a.value = s.versions.at(-1).id;
    b.value = s.head;
    const compare = el('button', 'Compare versions'),
      output = el('div');
    form.className = 'controls';
    form.append(a, b, compare);
    form.onsubmit = (e) => {
      e.preventDefault();
      output.replaceChildren();
      const before = s.versions.find((v) => v.id === a.value),
        after = s.versions.find((v) => v.id === b.value),
        old = new Map(before.files.map((f) => [f.path, f])),
        next = new Map(after.files.map((f) => [f.path, f]));
      let changed = 0;
      for (const p of [...new Set([...old.keys(), ...next.keys()])].sort()) {
        const x = old.get(p),
          y = next.get(p);
        if (x?.hash === y?.hash) continue;
        changed++;
        const hashes = new Set(x?.chunks?.map((c) => c.hash) ?? []),
          reuse = y?.chunks?.filter((c) => hashes.has(c.hash)).reduce((n, c) => n + c.size, 0);
        output.append(
          el(
            'p',
            `${!x ? 'Added' : !y ? 'Removed' : 'Changed'} ${p}${reuse !== undefined ? ` · ${reuse.toLocaleString()} bytes reused in chunks` : ''}`,
            'diff-row',
          ),
        );
      }
      if (!changed)
        output.append(el('p', 'Identical file trees. Each signed publication remains preserved.'));
    };
    root.append(form, output);
  }
  for (const v of s.versions) {
    const det = el('details');
    det.append(
      el(
        'summary',
        `${date(v.created)} · ${v.available}/${v.total} files archived${v.legacyReconstruction ? ' · reconstructed legacy tree' : ''}`,
      ),
      el('code', v.id),
      el('code', 'Aggregate: ' + v.aggregate),
    );
    if (v.merkleRoot) det.append(el('code', 'Hashtree root: ' + v.merkleRoot));
    for (const f of v.files) det.append(el('p', f.path + ' · ' + f.hash));
    root.append(det);
  }
  root.append(el('h2', 'Relationships'));
  for (const r of s.relations) {
    const p = el('p', r.type + ' (signed claim; lineage unverified): '),
      target = data.sites.find((t) => t.site === r.target);
    p.append(target ? internal(target) : el('code', r.target));
    root.append(p);
  }
  for (const group of data.groups.filter((g) => g.members.includes(s.site))) {
    const p = el('p', group.type + ': ');
    for (const id of group.members.filter((id) => id !== s.site)) {
      const other = data.sites.find((t) => t.site === id);
      if (other) p.append(internal(other), document.createTextNode(' · '));
    }
    root.append(p);
  }
  if (!s.relations.length && !data.groups.some((g) => g.members.includes(s.site)))
    root.append(el('p', 'No declared or detected relationship.'));
  const sources = el('details');
  sources.append(el('summary', 'Discovery provenance'));
  for (const source of s.sources) sources.append(el('p', source));
  root.append(sources);
}
$('import').addEventListener('change', async (event) => {
  try {
    const f = event.target.files[0];
    if (!f) return;
    if (f.size > 128 * 1024 ** 2) throw Error('Index exceeds the 128 MiB browser import limit.');
    load(JSON.parse(await f.text()));
  } catch (e) {
    message(e.message, true);
  } finally {
    event.target.value = '';
  }
});
$('search').oninput = () => {
  limit = 50;
  render();
};
$('sort').onchange = () => {
  limit = 50;
  render();
};
$('filtered').onchange = () => {
  limit = 50;
  render();
};
$('more').onclick = () => {
  limit += 50;
  render();
};
for (const button of document.querySelectorAll('[data-view]'))
  button.onclick = () => {
    view = button.dataset.view;
    limit = 50;
    for (const other of document.querySelectorAll('[data-view]'))
      other.setAttribute('aria-pressed', String(other === button));
    render();
  };
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })),
    a = link('', '');
  a.href = url;
  a.download = 'directory.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener('hashchange', route);
if (location.protocol === 'file:')
  message('Import directory.json to open your offline collection.');
else
  fetch('directory.json')
    .then((r) => {
      if (!r.ok) throw Error('Import directory.json to open a collection.');
      return r.json();
    })
    .then(load)
    .catch((e) => message(e.message, true));
