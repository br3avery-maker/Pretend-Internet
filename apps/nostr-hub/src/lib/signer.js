import { BunkerSigner, createNostrConnectURI, parseBunkerInput } from 'nostr-tools/nip46';
import { generateSecretKey, getEventHash, getPublicKey } from 'nostr-tools/pure';
import { checkSignature, endpoints } from './nostr.js';
import { validPubkey } from './model.js';
import { drop, get, put } from './store.js';

const sessionId = 'remote-signer';
const sessionData = (owner, pointer) => new TextEncoder().encode(JSON.stringify([owner, pointer]));
export const forgetRemoteSession = () => drop('connections', sessionId);

async function persistRemoteSession(owner, bp, clientKey) {
  // Only the app's delegation key is stored, with a non-extractable wrapping key.
  const pointer = { pubkey: bp.pubkey, relays: [...bp.relays], secret: null };
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: sessionData(owner, pointer) }, key, clientKey);
  await put('connections', { id: sessionId, owner, pointer, key, iv, ciphertext });
}


function withTimeout(operation, duration, message) {
  let timer;
  return Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), duration); })])
    .finally(() => clearTimeout(timer));
}
async function identify(provider, close = async () => {}, identifyTimeout = 45000) {
  try {
    const pubkey = await withTimeout(provider.getPublicKey(), identifyTimeout, 'The signer did not return a public key in time.');
    if (!validPubkey(pubkey)) throw new Error('The signer returned an invalid public key.');
    return {
      pubkey, close,
      async sign(template) {
        const candidate = await withTimeout(provider.signEvent(structuredClone(template)), 90000, 'Signing timed out.');
        return checkSignature(template, candidate, pubkey);
      },
    };
  } catch (error) { await close(); throw error; }
}
export function extensionSigner() {
  if (!globalThis.nostr?.getPublicKey || !globalThis.nostr?.signEvent) throw new Error('This browser has no Nostr extension. Use Connect to Amber or another remote signer.');
  return identify(globalThis.nostr);
}

async function useRemoteSigner(provider, key, identifyTimeout) {
  const verified = await identify(provider, async () => {
    try { await provider.close(); } finally { key.fill(0); }
  }, identifyTimeout);
  return { ...verified, saveSession: () => persistRemoteSession(verified.pubkey, provider.bp, key) };
}

export async function restoreRemoteSession(owner) {
  const saved = await get('connections', sessionId);
  if (saved?.owner !== owner || !validPubkey(saved.pointer?.pubkey)
      || !Array.isArray(saved.pointer.relays) || !saved.pointer.relays.length
      || endpoints(saved.pointer.relays).length !== saved.pointer.relays.length) {
    throw new Error('The saved remote signer session is unavailable.');
  }
  const key = new Uint8Array(await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: saved.iv, additionalData: sessionData(owner, saved.pointer),
  }, saved.key, saved.ciphertext));
  try {
    const connected = await useRemoteSigner(BunkerSigner.fromBunker(key, saved.pointer, { skipSwitchRelays: true }), key, 12000);
    if (connected.pubkey === owner) return connected;
    await connected.close();
    throw new Error('The remote signer returned a different account.');
  } catch (error) { key.fill(0); throw error; }
}

// Adapted from the direct Android handoff in MojiSurvivor's Nostr engine.
function androidSignerURI(type, event, callbackURL) {
  const query = new URLSearchParams({ type, appName: 'Pretend Internet',
    compressionType: 'none', returnType: 'signature', id: crypto.randomUUID() });
  if (event) query.set('current_user', event.pubkey);
  if (callbackURL) query.set('callbackUrl', callbackURL);
  // Amber decodes before splitting on the URI's query delimiter.
  const payload = event ? encodeURIComponent(JSON.stringify(event).replaceAll('?', '\\u003f')) : '';
  return `nostrsigner:${payload}?${query}`;
}

export const amberAccountURI = callbackURL => androidSignerURI('get_public_key', undefined, callbackURL);

export function amberSigner(pubkey, request) {
  const session = new AbortController();
  let pending = Promise.resolve();
  return {
    pubkey,
    mode: 'amber',
    async close() { session.abort(); },
    sign(template) {
      const unsigned = { ...structuredClone(template), pubkey };
      // Upload authorizations and multiple relay challenges can overlap.
      const signing = pending.then(() => {
        if (session.signal.aborted) throw new Error('Amber account disconnected.');
        return request(callbackURL => androidSignerURI('sign_event', unsigned, callbackURL), session.signal, raw => {
          const value = raw.trim();
          let event;
          if (/^[0-9a-f]{128}$/.test(value)) {
            event = { ...unsigned, id: getEventHash(unsigned), sig: value };
          } else {
            try { event = JSON.parse(value); }
            catch { throw new Error('Paste the signature copied by Amber.'); }
          }
          try { return checkSignature(unsigned, event, pubkey); }
          catch { throw new Error('The signature did not match this request or Amber account.'); }
        });
      });
      pending = signing.catch(() => {});
      return signing;
    },
  };
}
export function pairing(relay) {
  const allowed = endpoints([relay]);
  if (allowed.length !== 1) throw new Error('Enter a public wss:// signer relay.');
  const secretKey = generateSecretKey();
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const uri = createNostrConnectURI({ clientPubkey: getPublicKey(secretKey), relays: allowed, secret: nonce, name: 'Pretend Internet' });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error('The connection expired. Start a new pairing.')), 120000);
  // The active client stays on this page while the phone switches to the signer.
  const connected = BunkerSigner.fromURI(secretKey, uri, { skipSwitchRelays: true }, abort.signal)
    .then(provider => useRemoteSigner(provider, secretKey))
    .catch(error => { secretKey.fill(0); throw error; })
    .finally(() => clearTimeout(timer));
  return { uri, connected, cancel: () => abort.abort(new Error('Pairing cancelled.')) };
}
export async function pasteBunker(uri) {
  if (!uri.startsWith('bunker://')) throw new Error('Paste a bunker:// connection from the signer.');
  const pointer = await parseBunkerInput(uri);
  if (!pointer || !pointer.relays?.length || endpoints(pointer.relays).length !== pointer.relays.length) throw new Error('The signer link has invalid relay information.');
  const secretKey = generateSecretKey();
  const provider = BunkerSigner.fromBunker(secretKey, pointer);
  const close = async () => { try { await provider.close(); } finally { secretKey.fill(0); } };
  try { await withTimeout(provider.connect(), 90000, 'The signer did not approve the connection in time.'); }
  catch (error) {
    await close();
    if (/subscription closed/i.test(String(error?.message ?? error))) {
      throw new Error('The bunker relay closed before Amber could answer. On Android, use Sign in with Amber from your profile.');
    }
    throw error;
  }
  return useRemoteSigner(provider, secretKey);
}
