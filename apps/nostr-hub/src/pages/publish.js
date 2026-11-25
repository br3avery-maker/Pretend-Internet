import { button, el, heading, label, link, modal, muted, route, run, setStatus, status } from '../lib/dom.js';
import { bootstrap, endpoints, preferences, refreshIdentity, shortKey, transport } from '../lib/nostr.js';
import { extensionSigner, pairing, pasteBunker } from '../lib/signer.js';
import { execute, jobId, mediaFile, siteFiles, verifyReview } from '../lib/publisher.js';
import { all, get, put, setting, setSetting } from '../lib/store.js';

const typeNames = { note: 'Note', article: 'Article', track: 'Music release', nsite: 'Nsite' };
const defaultBlossom = 'https://blossom.primal.net';
const fileIds = { nsite: 'site-input', track: 'track-input' };

function receiptPanel(job) {
  const results = { verified: 'Verified by relay readback', 'partially-verified': 'Verified on some relays', 'accepted-unverified': 'Accepted without independent readback',
    'not-delivered': 'Delivery failed', uploading: 'Blossom files verified, publication incomplete', signed: 'Signed, delivery pending' };
  const copy = button('Export receipt', () => {
    const data = { ...job, event: job.event && { id: job.event.id, pubkey: job.event.pubkey, kind: job.event.kind, created_at: job.event.created_at } };
    const blob = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = el('a', { href: blob, download: `publish-${job.id.slice(0, 12)}.json` });
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(blob), 1000);
  });
  const detail = el('details', { class: 'entry' }, el('summary', {}, `${job.title || typeNames[job.type]} · ${results[job.status] || job.status}`),
    job.event && el('p', {}, el('code', {}, job.event.id)),
    el('p', {}, `${Object.keys(job.uploads).length} verified Blossom files`),
    job.attempts.length > 0 && el('ul', { class: 'stack-tight' }, job.attempts.map(row =>
      el('li', {}, el('code', {}, row.url), ' · ', row.verified ? 'Verified' : row.accepted ? 'Accepted' : row.code))),
    el('div', { class: 'row' }, copy, job.url && job.attempts.some(row => row.verified) &&
      el('a', { class: 'button', href: job.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open publication')));
  return detail;
}

export async function render(main) {
  const drafts = setting('drafts', {});
  const notice = status();
  const signerLine = muted('No signer connected');
  const interrupted = sessionStorage.getItem('pretend-internet:pairing') === 'waiting';
  sessionStorage.removeItem('pretend-internet:pairing');
  const pairingStatus = status(interrupted ? 'The previous pairing was interrupted. Start a new connection.' : '');
  const transportRelay = el('input', { value: 'wss://relay.nsecbunker.com', 'aria-label': 'Signer transport relay', spellcheck: 'false' });
  const uriBox = el('textarea', { readOnly: true, hidden: true, 'aria-label': 'Copyable connection link', rows: 3 });
  const bunkerInput = el('input', { type: 'password', placeholder: 'bunker://…', autocomplete: 'off', spellcheck: 'false' });
  let signer;
  let attempt;
  const connect = el('button', { type: 'button' }, 'Copy connection');
  connect.addEventListener('click', run(connect, pairingStatus, async () => {
    attempt = pairing(transportRelay.value.trim());
    sessionStorage.setItem('pretend-internet:pairing', 'waiting');
    uriBox.value = attempt.uri;
    uriBox.hidden = false;
    cancelPair.hidden = false;
    const pending = attempt.connected;
    pending.catch(() => {});
    try {
      try {
        await navigator.clipboard.writeText(attempt.uri);
        setStatus(pairingStatus, 'Copied. Paste in your signer, approve, then return here.');
      } catch {
        uriBox.focus();
        uriBox.select();
        setStatus(pairingStatus, 'Copy the selected link, paste it into your signer, then return.');
      }
      await useSigner(await pending);
    } finally {
      attempt = null;
      sessionStorage.removeItem('pretend-internet:pairing');
      uriBox.value = '';
      uriBox.hidden = true;
      cancelPair.hidden = true;
    }
  }));
  const cancelPair = button('Cancel pairing', () => attempt?.cancel());
  cancelPair.hidden = true;
  const useBrowser = el('button', { type: 'button' }, 'Use browser signer');
  useBrowser.addEventListener('click', run(useBrowser, pairingStatus, async () => { await useSigner(await extensionSigner()); }));
  const useLink = el('button', { type: 'button' }, 'Connect bunker link');
  useLink.addEventListener('click', run(useLink, pairingStatus, async () => {
    const value = bunkerInput.value.trim();
    bunkerInput.value = '';
    await useSigner(await pasteBunker(value));
  }));
  const connection = modal('Connect a signer', 'sheet', signerLine, useBrowser,
    el('section', { class: 'stack-tight' }, el('h3', {}, 'Amber or remote signer'), label('Signer transport relay', transportRelay),
      connect, uriBox, cancelPair, el('details', {}, el('summary', {}, 'Use a bunker link'), label('Bunker connection link', bunkerInput), useLink)),
    pairingStatus);
  const connectUI = button('Connect signer', () => connection.showModal(), 'secondary');
  const disconnect = button('Disconnect signer', async () => {
    if (signer) { await signer.close(); signer = null; }
    signerLabel.textContent = 'External signer disconnected.';
    disconnect.hidden = true;
    connectUI.textContent = 'Connect signer';
  });
  disconnect.hidden = true;
  const signerLabel = muted('A signer is required to publish.');
  async function useSigner(value) {
    if (signer) { await signer.close(); }
    signer = value;
    signerLabel.textContent = 'Signing as ' + shortKey(signer.pubkey);
    signerLine.textContent = signerLabel.textContent;
    connectUI.textContent = 'Change signer';
    disconnect.hidden = false;
    connection.close();
    setStatus(pairingStatus, '');
    try { await refreshIdentity(signer.pubkey); } catch { /* Use cached preferences or the explicit fallback. */ }
    await setDestinations();
  }

  const type = el('select', {}, Object.entries(typeNames).map(([id, name]) => el('option', { value: id }, name)));
  const title = el('input', { maxlength: 140 });
  const identifier = el('input', { maxlength: 70, spellcheck: 'false' });
  const artist = el('input', { maxlength: 100 });
  const text = el('textarea', { maxlength: 70000 });
  const titleField = label('Title', title);
  const identifierField = label('Stable identifier for updates', identifier);
  const artistField = label('Artist', artist);
  const textField = label('Content', text);
  const siteInput = el('input', { type: 'file', accept: '.html,.htm,.zip' });
  const folderInput = el('input', { type: 'file', multiple: true, webkitdirectory: '', directory: '' });
  const audioInput = el('input', { type: 'file', accept: 'audio/*' });
  const coverInput = el('input', { type: 'file', accept: 'image/*' });
  const fileMessage = status();
  const mediaFields = el('div', { class: 'stack-tight' }, label('Audio', audioInput), label('Cover art (optional)', coverInput));
  const siteFields = el('div', { class: 'stack-tight' }, label('HTML or ZIP', siteInput), label('Or choose a static folder', folderInput));
  const destinations = el('div', { class: 'stack-tight' });
  const server = el('select');
  const serverField = label('Blossom server', server);
  const formMessage = status();
  const receipts = el('section', { class: 'stack-tight' });
  const reviewBtn = el('button', { class: 'primary' }, 'Review publication');
  let files = [];
  let updatingFiles = false;
  let selectionId = 0;

  async function setDestinations() {
    const key = signer?.pubkey || setting('account', '');
    const { write, blossom } = key ? await preferences(key) : { write: [], blossom: [] };
    const picked = drafts[type.value]?.relays;
    const list = endpoints([...setting('relays', []), ...write, bootstrap[0]]).slice(0, 12);
    const defaults = list.slice(0, 2);
    destinations.replaceChildren(el('h3', {}, 'Relay destinations'), ...list.map(url =>
      el('label', { class: 'check' }, el('input', { type: 'checkbox', value: url, checked: picked ? picked.includes(url) : defaults.includes(url) }), el('code', {}, url))));
    const servers = endpoints([...setting('blossom', []), ...blossom, defaultBlossom], true).slice(0, 12);
    server.replaceChildren(...servers.map(url => el('option', { value: url }, url)));
    if (servers.includes(drafts[type.value]?.server)) server.value = drafts[type.value].server;
  }
  const collect = () => ({ type: type.value, title: title.value.trim(), slug: identifier.value.trim(), body: text.value.trim(), artist: artist.value.trim(),
    server: serverField.hidden ? '' : server.value,
    relays: [...destinations.querySelectorAll('input:checked')].map(node => node.value) });
  function saveDraft() {
    drafts[type.value] = collect();
    setSetting('draft-type', type.value);
    setSetting('drafts', drafts);
  }
  async function applyType() {
    const value = type.value;
    const saved = drafts[value] || {};
    const next = ++selectionId;
    updatingFiles = false;
    const labels = { note: 'Note', article: 'Markdown article', track: 'Lyrics or description', nsite: 'Site description' };
    titleField.hidden = value === 'note';
    identifierField.hidden = value === 'note';
    artistField.hidden = value !== 'track';
    textField.firstChild.textContent = labels[value];
    siteFields.hidden = value !== 'nsite';
    mediaFields.hidden = value !== 'track';
    serverField.hidden = !['track', 'nsite'].includes(value);
    title.value = saved.title || '';
    identifier.value = saved.slug || '';
    text.value = saved.body || '';
    artist.value = saved.artist || '';
    for (const input of [siteInput, folderInput, audioInput, coverInput]) input.value = '';
    const record = fileIds[value] ? await get('files', fileIds[value]) : null;
    if (selectionId !== next) return;
    files = record?.files || [];
    setStatus(fileMessage, files.length ? `${files.length} staged files: ${files.slice(0, 4).map(file => file.path).join(', ')}.` : '');
    setStatus(formMessage, '');
    await setDestinations();
  }
  async function stage(kind, action) {
    const current = ++selectionId;
    updatingFiles = true;
    setStatus(fileMessage, 'Checking selected files.');
    try {
      const prepared = await action();
      if (selectionId !== current || type.value !== kind) return;
      await put('files', { id: fileIds[kind], files: prepared });
      files = prepared;
      setStatus(fileMessage, `${files.length} staged files: ${files.slice(0, 4).map(file => file.path).join(', ')}.`);
    } catch (error) { if (selectionId === current) setStatus(fileMessage, error.message); }
    finally { if (selectionId === current) updatingFiles = false; }
  }
  for (const input of [siteInput, folderInput]) input.addEventListener('change', () => {
    const chosen = [...input.files];
    if (chosen.length) stage('nsite', () => siteFiles(chosen));
  });
  for (const input of [audioInput, coverInput]) input.addEventListener('change', () => {
    stage('track', async () => {
      const audio = audioInput.files[0] ? await mediaFile(audioInput.files[0], 'audio/') : files[0];
      if (!audio) throw new Error('Choose the audio file first.');
      const image = coverInput.files[0] ? await mediaFile(coverInput.files[0], 'image/') : files[1];
      return image ? [audio, image] : [audio];
    });
  });
  async function showReceipts() {
    const rows = (await all('receipts')).sort((a, b) => b.createdAt - a.createdAt);
    receipts.replaceChildren(el('h2', {}, 'Receipts'), ...(rows.length ? rows.map(receiptPanel) : [muted('No publication receipts yet.')]));
  }
  const form = el('form', {},
    label('Publication type', type), titleField, identifierField, artistField, textField,
    mediaFields, siteFields, fileMessage, serverField, destinations, reviewBtn, formMessage);
  type.value = setting('draft-type', 'note');
  if (!type.value) type.value = 'note';
  type.addEventListener('change', () => { setSetting('draft-type', type.value); void applyType(); });
  form.addEventListener('input', event => { if (event.target !== type && event.target.type !== 'file') saveDraft(); });
  form.addEventListener('submit', run(reviewBtn, formMessage, async () => {
    if (updatingFiles) throw new Error('Wait for the selected files to finish staging.');
    if (!signer) { connection.showModal(); return; }
    const selection = collect();
    const snapshot = ['track', 'nsite'].includes(selection.type) ? files.slice() : [];
    const selectedSigner = signer;
    verifyReview(selection, snapshot);
    const progress = status();
    const send = el('button', { class: 'primary', type: 'button' }, 'Sign and publish');
    const review = modal('Review public publication', 'sheet',
      el('p', {}, `${typeNames[selection.type]} · ${selection.title || 'New note'}`),
      muted('Account ' + shortKey(selectedSigner.pubkey)),
      selection.body && el('div', { class: 'inline-preview' }, selection.body),
      selection.server && el('p', {}, `${snapshot.length} ${snapshot.length === 1 ? 'file' : 'files'} will be uploaded to `, el('code', {}, selection.server)),
      selection.type === 'nsite' && el('details', {}, el('summary', {}, 'Files to upload'),
        el('ul', {}, snapshot.map(file => el('li', {}, file.path, ' · ', el('code', {}, file.hash))))),
      el('ul', {}, selection.relays.map(url => el('li', {}, el('code', {}, url)))), send, progress);
    review.addEventListener('close', () => review.remove(), { once: true });
    send.addEventListener('click', run(send, progress, async () => {
      if (signer !== selectedSigner) throw new Error('The signer changed. Reopen the review.');
      review.dataset.busy = 'true';
      review.querySelector('button').disabled = true;
      const lockClose = event => event.preventDefault();
      review.addEventListener('cancel', lockClose);
      const queued = async lock => {
        if (!lock) throw new Error('A publication is already in progress in another tab.');
        const prior = await get('receipts', await jobId(selectedSigner.pubkey, selection, snapshot));
        const job = await execute({ draft: selection, files: snapshot, signer: selectedSigner, transport, previous: prior,
          checkpoint: async value => { await put('receipts', value); setStatus(progress, value.status === 'uploading' ? 'Verified a Blossom upload.' : value.status === 'signed' ? 'Signed. Checking relay acceptance and readback.' : value.status); } });
        await showReceipts();
        if (job.status === 'verified') {
          setStatus(notice, 'The signed event was independently read back from every selected relay.');
          review.close();
        } else setStatus(progress, 'Delivery is incomplete. See the receipt below the form. Retrying reuses the signed event.');
      };
      try {
        setStatus(progress, 'Waiting for the approved signer.');
        if (navigator.locks) await navigator.locks.request('pretend-internet:publish', { ifAvailable: true }, queued);
        else await queued(true);
      } finally {
        if (review.isConnected) {
          delete review.dataset.busy;
          review.querySelector('button').disabled = false;
          review.removeEventListener('cancel', lockClose);
        }
      }
    }));
    review.showModal();
  }));
  main.replaceChildren(heading('Publish', connectUI), signerLabel, disconnect, notice, form, receipts, link('Network settings', route('network')));
  await applyType();
  await showReceipts();
}
