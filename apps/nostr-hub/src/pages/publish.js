import { button, el, heading, label, link, modal, muted, query, route, run, setStatus, status } from '../lib/dom.js';
import { bootstrap, endpoints, npub, parseKey, preferences, refreshIdentity, shortKey, transport } from '../lib/nostr.js';
import { amberAccountURI, amberSigner, extensionSigner, forgetRemoteSession, pairing, pasteBunker, restoreRemoteSession } from '../lib/signer.js';
import { execute, jobId, mediaFile, verifyReview } from '../lib/publisher.js';
import { all, get, put, saveAccount, setting, setSetting } from '../lib/store.js';
import { siteURL, validPubkey } from '../lib/model.js';
import { siteIntake } from '../lib/site-intake.js';
import { siteEditor } from './site-editor.js';

const typeNames = { note: 'Note', article: 'Article', track: 'Music release', nsite: 'Nsite' };
const defaultBlossom = 'https://blossom.primal.net';
const fileIds = { nsite: 'site-input', track: 'track-input' };
const signerKey = 'publishing-account';
const selectionKey = scope => 'staged-selection:' + scope;
const replacementRequired = 'Choose valid replacement files before publishing.';

function requestAmberSignature(uri, signal, verify) {
  return new Promise((resolve, reject) => {
    const field = el('textarea', { required: true, autocomplete: 'off', spellcheck: 'false', rows: 3 });
    const message = status();
    const form = el('form', {}, label('Amber signature', field), el('button', { class: 'primary' }, 'Use signature'), message);
    const paste = button('Paste Amber signature', async () => {
      try {
        field.value = await navigator.clipboard.readText();
        finish(null, verify(field.value));
      } catch (error) {
        setStatus(message, error.name === 'NotAllowedError' ? 'Paste the signature into the field below.' : error.message);
      }
    });
    paste.hidden = !navigator.clipboard?.readText;
    const dialog = modal('Sign in Amber', 'sheet',
      el('p', {}, 'Approve in Amber, return here, and paste the signature it copied.'),
      el('div', { class: 'row' }, link('Open Amber', uri, 'button secondary'), paste), form);
    const expire = setTimeout(() => finish(new Error('The Amber request expired. Try signing again.')), 120000);
    const cancel = () => finish(new Error('The Amber request was cancelled.'));
    let settled = false;
    function finish(error, event) {
      if (settled) return;
      settled = true;
      clearTimeout(expire);
      signal.removeEventListener('abort', cancel);
      dialog.removeEventListener('close', cancel);
      field.value = '';
      dialog.close();
      dialog.remove();
      if (error) reject(error);
      else resolve(event);
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      try { finish(null, verify(field.value)); }
      catch (error) { setStatus(message, error.message); }
    });
    signal.addEventListener('abort', cancel, { once: true });
    dialog.addEventListener('close', cancel, { once: true });
    dialog.showModal();
  });
}

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
  useBrowser.addEventListener('click', run(useBrowser, pairingStatus, async () => { await useSigner(await extensionSigner(), 'browser'); }));
  const amberKey = el('input', { placeholder: 'npub1…', autocomplete: 'off', spellcheck: 'false' });
  const openAmber = link('Open Amber', amberAccountURI(), 'button primary');
  openAmber.addEventListener('click', () => setStatus(pairingStatus,
    'Approve the public-key request in Amber, then return and paste the public key.'));
  const useAmber = el('button', { type: 'button' }, 'Use Amber public key');
  async function selectAmber() {
    const pubkey = parseKey(amberKey.value);
    amberKey.value = '';
    await useSigner(amberSigner(pubkey, requestAmberSignature), 'amber');
  }
  useAmber.addEventListener('click', run(useAmber, pairingStatus, selectAmber));
  const pasteAmber = el('button', { type: 'button', hidden: !navigator.clipboard?.readText }, 'Paste Amber public key');
  pasteAmber.addEventListener('click', run(pasteAmber, pairingStatus, async () => {
    try { amberKey.value = await navigator.clipboard.readText(); }
    catch { throw new Error('Paste the public key into the field below.'); }
    await selectAmber();
  }));
  const useLink = el('button', { type: 'button' }, 'Connect bunker link');
  useLink.addEventListener('click', run(useLink, pairingStatus, async () => {
    const value = bunkerInput.value.trim();
    bunkerInput.value = '';
    await useSigner(await pasteBunker(value));
  }));
  const connection = modal('Connect a signer', 'sheet', signerLine,
    el('section', { class: 'stack-tight' }, el('div', { class: 'row' }, openAmber, pasteAmber), label('Amber public key', amberKey), useAmber),
    useBrowser,
    el('details', { class: 'stack-tight' }, el('summary', {}, 'Remote signer'),
      label('Signer transport relay', transportRelay),
      connect, uriBox, cancelPair, el('details', {}, el('summary', {}, 'Use a bunker link'), label('Bunker connection link', bunkerInput), useLink)),
    pairingStatus);
  const connectUI = button('Connect signer', () => connection.showModal(), 'secondary');
  const disconnect = button('Disconnect signer', async () => {
    if (signer) { await signer.close(); signer = null; }
    setSetting(signerKey, null);
    try { await forgetRemoteSession(); }
    catch { setStatus(notice, 'Could not remove the local remote signer session.'); }
    signerLabel.textContent = 'External signer disconnected.';
    signerLine.textContent = signerLabel.textContent;
    disconnect.hidden = true;
    connectUI.textContent = 'Connect signer';
    await editor.reset();
    await applyType();
  });
  disconnect.hidden = true;
  const signerLabel = muted('A signer is required to publish.');
  function displaySigner() {
    signerLabel.textContent = signer.mode === 'amber'
      ? 'Amber account ' + shortKey(signer.pubkey) + ' · approval required for each signature'
      : 'Signing as ' + shortKey(signer.pubkey);
    signerLine.textContent = signerLabel.textContent;
    connectUI.textContent = 'Change signer';
    disconnect.hidden = false;
  }
  async function useSigner(value, mode = 'remote') {
    const previous = signer?.pubkey;
    try {
      if (mode === 'remote') await value.saveSession();
      else await forgetRemoteSession();
    } catch {
      await value.close();
      throw new Error('This device could not save the signer session.');
    }
    if (signer) await signer.close();
    signer = value;
    setSetting(signerKey, { pubkey: signer.pubkey, mode });
    saveAccount(signer.pubkey, !setting('account'));
    displaySigner();
    connection.close();
    setStatus(pairingStatus, '');
    if (previous !== signer.pubkey) {
      await editor.reset();
      await applyType();
    }
    try { await refreshIdentity(signer.pubkey); } catch { /* Cached destinations remain available. */ }
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
  const siteInput = el('input', { type: 'file', accept: '.html,.htm,.zip,.md,.txt' });
  const folderInput = el('input', { type: 'file', multiple: true, webkitdirectory: '', directory: '' });
  const audioInput = el('input', { type: 'file', accept: 'audio/*' });
  const coverInput = el('input', { type: 'file', accept: 'image/*' });
  const fileMessage = status();
  const mediaFields = el('div', { class: 'stack-tight' }, label('Audio', audioInput), label('Cover art (optional)', coverInput));
  const siteLabel = label('HTML, ZIP, Markdown or text', siteInput);
  const siteFields = el('div', { class: 'stack-tight' }, siteLabel, label('Or choose a static folder', folderInput));
  const destinations = el('div', { class: 'stack-tight' });
  const server = el('select');
  const serverField = label('Blossom server', server);
  const formMessage = status();
  const receipts = el('section', { class: 'stack-tight' });
  const reviewBtn = el('button', { class: 'primary' }, 'Review publication');
  let files = [];
  let stagedSelection = null;
  let updatingFiles = false;
  let selectionId = 0;
  const editor = siteEditor({ title, identifier, text, signer: () => signer, onChange: applyType });
  const scope = kind => [signer?.pubkey || 'guest', kind, kind === 'nsite' ? editor.scope() : 'draft'].join(':');
  const draftKey = () => 'draft:' + scope(type.value);
  const storageId = kind => 'staged:' + scope(kind);
  const selectedKey = kind => selectionKey(storageId(kind));

  async function setDestinations() {
    const key = signer?.pubkey || setting('account', '');
    const { write, blossom } = key ? await preferences(key) : { write: [], blossom: [] };
    const saved = setting(draftKey(), {});
    const picked = saved.relays;
    const list = endpoints([...setting('relays', []), ...write, bootstrap[0]]).slice(0, 12);
    const defaults = list.slice(0, 2);
    destinations.replaceChildren(el('h3', {}, 'Relay destinations'), ...list.map(url =>
      el('label', { class: 'check' }, el('input', { type: 'checkbox', value: url, checked: picked ? picked.includes(url) : defaults.includes(url) }), el('code', {}, url))));
    const servers = endpoints([...setting('blossom', []), ...blossom, defaultBlossom], true).slice(0, 12);
    server.replaceChildren(...servers.map(url => el('option', { value: url }, url)));
    if (servers.includes(saved.server)) server.value = saved.server;
  }
  const collect = () => ({ type: type.value, title: title.value.trim(), slug: type.value === 'nsite' ? editor.slug() : identifier.value.trim(), body: text.value.trim(), artist: artist.value.trim(),
    server: serverField.hidden ? '' : server.value,
    relays: [...destinations.querySelectorAll('input:checked')].map(node => node.value) });
  function saveDraft() {
    setSetting('draft-type', type.value);
    if (type.value !== 'nsite' || !editor.restoring()) setSetting(draftKey(), collect());
  }
  async function applyType() {
    const value = type.value;
    const isSite = value === 'nsite';
    const restore = isSite && editor.restoring();
    const saved = restore ? {} : setting(draftKey(), !isSite && !signer ? setting('drafts', {})[value] ?? {} : {});
    const next = ++selectionId;
    files = [];
    stagedSelection = null;
    updatingFiles = Boolean(fileIds[value]);
    const labels = { note: 'Note', article: 'Markdown article', track: 'Lyrics or description', nsite: 'Site description' };
    titleField.hidden = value === 'note';
    identifierField.hidden = value === 'note';
    artistField.hidden = value !== 'track';
    title.readOnly = identifier.readOnly = text.readOnly = false;
    textField.firstChild.textContent = labels[value];
    editor.node.hidden = !isSite;
    siteFields.hidden = !isSite || restore;
    siteLabel.firstChild.textContent = editor.creating() ? 'HTML, ZIP, Markdown or text' : 'File or ZIP of changes';
    siteInput.accept = editor.creating() ? '.html,.htm,.zip,.md,.txt' : '';
    mediaFields.hidden = value !== 'track';
    serverField.hidden = !['track', 'nsite'].includes(value);
    const defaults = isSite ? editor.defaults() : {};
    title.value = saved.title ?? defaults.title ?? '';
    identifier.value = isSite && !editor.creating() ? editor.slug() : saved.slug ?? '';
    text.value = saved.body ?? defaults.body ?? '';
    if (isSite) editor.draw();
    artist.value = saved.artist || '';
    for (const input of [siteInput, folderInput, audioInput, coverInput]) input.value = '';
    let record;
    let storageError;
    try {
      if (fileIds[value] && !restore) record = await get('files', storageId(value));
    } catch (error) { storageError = error; }
    if (selectionId !== next) return;
    updatingFiles = false;
    const expected = restore ? null : setting(selectedKey(value));
    if (!storageError && (record?.selection ?? null) === expected) {
      files = record?.files || [];
      stagedSelection = expected;
    }
    setStatus(fileMessage, storageError?.message || (expected && !files.length ? replacementRequired : fileSummary()));
    setStatus(formMessage, '');
    await setDestinations();
  }
  function fileSummary() {
    return files.length ? `${files.length} staged files: ${files.slice(0, 4).map(file => file.path).join(', ')}.` : '';
  }
  async function stage(kind, action) {
    const current = ++selectionId;
    const key = selectedKey(kind);
    const id = storageId(kind);
    const previous = stagedSelection === setting(key) ? files : [];
    const token = crypto.randomUUID();
    files = [];
    stagedSelection = null;
    updatingFiles = true;
    setStatus(fileMessage, 'Checking selected files.');
    try {
      // Invalidate the saved selection before validation or the asynchronous write.
      setSetting(key, token);
      const prepared = await action(previous);
      if (selectionId !== current || setting(key) !== token) return;
      await put('files', { id, selection: token, files: prepared });
      if (selectionId !== current || setting(key) !== token) return;
      files = prepared;
      stagedSelection = token;
      setStatus(fileMessage, fileSummary());
    } catch (error) { if (selectionId === current) setStatus(fileMessage, error.message); }
    finally { if (selectionId === current) updatingFiles = false; }
  }
  for (const input of [siteInput, folderInput]) input.addEventListener('change', () => {
    const chosen = [...input.files];
    if (!chosen.length) return;
    const partial = !editor.creating();
    let intake;
    void stage('nsite', async () => { intake = await siteIntake(chosen, partial); return intake.files; }).then(() => {
      if (!intake || files !== intake.files || partial) return;
      title.value ||= intake.title;
      identifier.value ||= intake.slug;
      text.value ||= intake.description;
      editor.drawAddress();
      saveDraft();
    });
  });
  for (const input of [audioInput, coverInput]) input.addEventListener('change', () => {
    const audioFile = audioInput.files[0];
    const coverFile = coverInput.files[0];
    stage('track', async previous => {
      const audio = audioFile ? await mediaFile(audioFile, 'audio/') : previous[0];
      if (!audio) throw new Error('Choose the audio file first.');
      const image = coverFile ? await mediaFile(coverFile, 'image/') : previous[1];
      return image ? [audio, image] : [audio];
    });
  });
  async function showReceipts() {
    const rows = (await all('receipts')).sort((a, b) => b.createdAt - a.createdAt);
    receipts.replaceChildren(el('h2', {}, 'Receipts'), ...(rows.length ? rows.map(receiptPanel) : [muted('No publication receipts yet.')]));
  }
  const form = el('form', {},
    label('Publication type', type), editor.node, titleField, identifierField, artistField, textField,
    mediaFields, siteFields, fileMessage, serverField, destinations, reviewBtn, formMessage);
  type.value = query.has('site') ? 'nsite' : setting('draft-type', 'note');
  if (!type.value) type.value = 'note';
  type.addEventListener('change', () => { setSetting('draft-type', type.value); void applyType(); });
  form.addEventListener('input', event => { if (event.target !== type && event.target.type !== 'file') saveDraft(); });
  form.addEventListener('submit', run(reviewBtn, formMessage, async () => {
    setStatus(notice, '');
    if (updatingFiles) throw new Error('Wait for the selected files to finish staging.');
    const selection = collect();
    const checkedSelection = selectionId;
    const checkedToken = stagedSelection;
    const stagedKey = selection.type === 'nsite' && editor.restoring() ? '' : selectedKey(selection.type);
    if (fileIds[selection.type] && stagedKey && checkedToken !== setting(stagedKey)) throw new Error(replacementRequired);
    if (!signer) { connection.showModal(); return; }
    const snapshot = ['track', 'nsite'].includes(selection.type) ? files.slice() : [];
    const selectedSigner = signer;
    let prepared;
    if (selection.type === 'nsite') {
      if (setting(signerKey)?.pubkey !== selectedSigner.pubkey) throw new Error('Confirm your publishing account again.');
      setStatus(formMessage, 'Checking the signed nsite address and version.');
      prepared = await editor.prepare(selection, snapshot, selectedSigner.pubkey);
      selection.site = prepared.site;
      setStatus(formMessage, '');
    }
    verifyReview(selection, snapshot);
    const progress = status();
    const send = el('button', { class: 'primary', type: 'button' }, 'Sign and publish');
    const count = prepared?.plan.uploads.length ?? snapshot.length;
    const titleText = { create: 'Create nsite', update: 'Update nsite', restore: 'Restore nsite' }[selection.site?.mode] || typeNames[selection.type];
    const url = prepared && siteURL(selectedSigner.pubkey, selection.slug, npub(selectedSigner.pubkey));
    const deletions = prepared?.plan.changes.filter(row => row.action === 'Remove') ?? [];
    const confirm = deletions.length && el('input', { type: 'checkbox' });
    const review = modal('Review public publication', 'sheet',
      el('p', {}, titleText + ' · ' + (selection.title || 'New note')),
      el('p', {}, 'Publishing account ', el('code', {}, npub(selectedSigner.pubkey))),
      url && el('p', {}, 'Nsite address ', el('code', {}, url)),
      prepared?.plan.current && el('p', {}, 'Current signed version ', el('code', {}, prepared.plan.current.id)),
      selection.body && el('div', { class: 'inline-preview' }, selection.body),
      selection.server && count > 0 && el('p', {}, count + ' files will be uploaded to ', el('code', {}, selection.server)),
      prepared && el('details', { open: prepared.plan.changes.length <= 12 ? '' : null }, el('summary', {}, 'File changes'),
        el('ul', {}, prepared.plan.changes.map(file => el('li', {}, file.action + ' ' + file.path,
          file.hash && ['Add', 'Change'].includes(file.action) && [' · ', el('code', {}, file.hash)])))),
      confirm && el('label', { class: 'check' }, confirm, 'Remove the ' + deletions.length + ' listed path(s) from this site'),
      el('ul', {}, selection.relays.map(url => el('li', {}, el('code', {}, url)))), send, progress);
    review.addEventListener('close', () => review.remove(), { once: true });
    send.addEventListener('click', run(send, progress, async () => {
      if (signer !== selectedSigner || (prepared && setting(signerKey)?.pubkey !== selectedSigner.pubkey)) throw new Error('The signer changed. Reopen the review.');
      if (confirm && !confirm.checked) throw new Error('Confirm the listed removals before signing.');
      if (fileIds[selection.type] && (checkedSelection !== selectionId || (stagedKey && checkedToken !== setting(stagedKey)))) {
        throw new Error('The selected files changed. Reopen the review.');
      }
      review.dataset.busy = 'true';
      review.querySelector('button').disabled = true;
      const lockClose = event => event.preventDefault();
      review.addEventListener('cancel', lockClose);
      const queued = async lock => {
        if (!lock) throw new Error('A publication is already in progress in another tab.');
        const prior = await get('receipts', await jobId(selectedSigner.pubkey, selection, snapshot));
        const job = await execute({ draft: selection, files: snapshot, signer: selectedSigner, transport, previous: prior, known: prepared?.known, backup: prepared?.backup,
          checkpoint: async value => { await put('receipts', value); setStatus(progress, value.status === 'uploading' ? 'Verified a Blossom upload.' : value.status === 'signed' ? 'Signed. Checking relay acceptance and readback.' : value.status); } });
        if (prepared && job.attempts.some(row => row.verified)) await put('events', job.event);
        await showReceipts();
        if (job.status === 'verified') {
          setStatus(notice, prepared ? 'The reviewed version is current on every selected relay. Its Blossom files were verified.'
            : 'The signed event was independently read back from every selected relay.');
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
  const saved = setting(signerKey);
  if (validPubkey(saved?.pubkey)) {
    if (saved.mode === 'amber') signer = amberSigner(saved.pubkey, requestAmberSignature);
    if (['browser', 'remote'].includes(saved.mode)) {
      try {
        const restored = saved.mode === 'remote' ? await restoreRemoteSession(saved.pubkey) : await extensionSigner();
        if (restored.pubkey !== saved.pubkey) throw new Error('The browser signer changed accounts.');
        signer = restored;
      } catch (error) { setStatus(notice, error.message + ' Reconnect your intended account.'); }
    }
    if (signer) displaySigner();
  }
  await editor.reset();
  await applyType();
  await showReceipts();
}
