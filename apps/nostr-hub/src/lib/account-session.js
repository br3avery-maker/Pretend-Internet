import { approveAmber, supportsAmberReturn } from './amber-return.js';
import { validPubkey } from './model.js';
import { amberSigner, extensionSigner, forgetRemoteSession, restoreRemoteSession } from './signer.js';
import { saveAccount, setting, setSetting } from './store.js';

export const publishingAccount = () => setting('publishing-account');

export async function savePublishingAccount(pubkey, mode, connection) {
  if (!validPubkey(pubkey)) throw new Error('The signer did not return a public key.');
  if (mode === 'remote') await connection.saveSession();
  else await forgetRemoteSession();
  saveAccount(pubkey);
  setSetting('publishing-account', { pubkey, mode });
}

export async function clearPublishingAccount() {
  setSetting('publishing-account', null);
  await forgetRemoteSession();
}

export async function publishingSigner() {
  const saved = publishingAccount();
  if (!validPubkey(saved?.pubkey)) return;
  if (saved.mode === 'amber') {
    if (supportsAmberReturn()) return amberSigner(saved.pubkey, approveAmber);
    throw new Error('The installed Android build is needed for this Amber account.');
  }
  const signer = saved.mode === 'remote' ? await restoreRemoteSession(saved.pubkey) : await extensionSigner();
  if (signer.pubkey === saved.pubkey) return signer;
  await signer.close();
  throw new Error('The current signer account differs from the signed-in account.');
}
