import { BunkerSigner, createNostrConnectURI, parseBunkerInput } from 'nostr-tools/nip46';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { checkSignature, endpoints } from './nostr.js';
import { validPubkey } from './model.js';

function withTimeout(operation, duration, message) {
  let timer;
  return Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), duration); })])
    .finally(() => clearTimeout(timer));
}
async function identify(provider, close = async () => {}) {
  try {
    const pubkey = await withTimeout(provider.getPublicKey(), 45000, 'The signer did not return a public key in time.');
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
    .then(provider => identify(provider, async () => { try { await provider.close(); } finally { secretKey.fill(0); } }))
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
  catch (error) { await close(); throw error; }
  return identify(provider, close);
}
