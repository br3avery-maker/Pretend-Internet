import { connectAmber, supportsAmberReturn } from '../lib/amber-return.js';
import { clearPublishingAccount, publishingAccount, savePublishingAccount } from '../lib/account-session.js';
import { el, label, link, query, route, run, setStatus, status } from '../lib/dom.js';
import { npub, parseKey } from '../lib/nostr.js';
import { amberAccountURI, extensionSigner, pairing, pasteBunker } from '../lib/signer.js';

export function accountSignIn() {
  const signedIn = publishingAccount();
  const feedback = status();
  const account = el('section', { class: 'entry stack-tight', id: 'sign-in', tabindex: '-1',
    'aria-label': 'Sign-in account' }, el('h2', {}, 'Your account'));
  const complete = async (pubkey, mode, signer) => {
    try {
      await savePublishingAccount(pubkey, mode, signer);
      setStatus(feedback, 'Signed in.');
      if (query.get('return') === 'publish') {
        location.replace(route('publish', { site: query.get('site') }));
      } else {
        location.replace(route('profile'));
      }
    } finally { await signer?.close(); }
  };
  let active = false;
  function connectWith(action) {
    return async () => {
      if (active) throw new Error('Finish the current sign-in request first.');
      active = true;
      try { await action(); }
      finally { active = false; }
    };
  }

  if (signedIn) {
    const signOut = el('button', { type: 'button' }, 'Sign out');
    signOut.addEventListener('click', run(signOut, feedback, connectWith(async () => {
      await clearPublishingAccount();
      location.replace(route('profile'));
    })));
    account.append(el('p', {}, 'Signed in with ' + ({ amber: 'Amber', remote: 'a remote signer', browser: 'a browser signer' }[signedIn.mode] || 'a signer')),
      el('p', {}, el('code', {}, npub(signedIn.pubkey))), signOut);
  }

  const methods = el('div', { class: 'stack-tight' });
  if (supportsAmberReturn()) {
    const amber = el('button', { type: 'button', class: 'primary' }, signedIn ? 'Switch account in Amber' : 'Sign in with Amber');
    const cancel = el('button', { type: 'button' }, 'Cancel');
    cancel.hidden = true;
    amber.addEventListener('click', run(amber, feedback, connectWith(async () => {
      let pubkey;
      try {
        pubkey = await connectAmber(amberAccountURI, parseKey, (href, stop) => {
          setStatus(feedback, 'Choose your account in Amber. If you decline, return here and cancel.');
          cancel.hidden = false;
          cancel.onclick = stop;
          const handoff = link('Amber', href);
          handoff.hidden = true;
          account.append(handoff);
          handoff.click();
          handoff.remove();
        });
      } finally {
        cancel.onclick = null;
        cancel.hidden = true;
      }
      await complete(pubkey, 'amber');
    })));
    methods.append(amber, cancel);
  }

  if (globalThis.nostr?.getPublicKey && globalThis.nostr?.signEvent) {
    const useBrowser = el('button', { type: 'button', class: supportsAmberReturn() ? 'secondary' : 'primary' }, 'Sign in with browser signer');
    useBrowser.addEventListener('click', run(useBrowser, feedback, connectWith(async () => {
      const signer = await extensionSigner();
      await complete(signer.pubkey, 'browser', signer);
    })));
    methods.append(useBrowser);
  }

  const bunker = el('input', { type: 'password', placeholder: 'bunker://…', autocomplete: 'off', spellcheck: 'false' });
  const connect = el('button', { class: 'primary' }, 'Connect bunker link');
  const form = el('form', {}, label('Bunker connection link', bunker), connect);
  form.addEventListener('submit', run(connect, feedback, connectWith(async () => {
    const value = bunker.value.trim();
    bunker.value = '';
    const signer = await pasteBunker(value);
    await complete(signer.pubkey, 'remote', signer);
  })));

  const relay = el('input', { value: 'wss://relay.nsecbunker.com', spellcheck: 'false' });
  const copy = el('button', { type: 'button' }, 'Copy connection');
  const cancelPair = el('button', { type: 'button', hidden: true }, 'Cancel pairing');
  const uri = el('textarea', { readOnly: true, hidden: true, 'aria-label': 'Connection link' });
  copy.addEventListener('click', run(copy, feedback, connectWith(async () => {
    const pair = pairing(relay.value.trim());
    pair.connected.catch(() => {});
    uri.value = pair.uri;
    uri.hidden = cancelPair.hidden = false;
    cancelPair.onclick = pair.cancel;
    try {
      try {
        await navigator.clipboard.writeText(pair.uri);
        setStatus(feedback, 'Copied. Open the connection in your remote signer.');
      } catch {
        uri.focus();
        uri.select();
        setStatus(feedback, 'Copy the selected link to your remote signer.');
      }
      const signer = await pair.connected;
      await complete(signer.pubkey, 'remote', signer);
    } finally {
      uri.value = '';
      uri.hidden = cancelPair.hidden = true;
      cancelPair.onclick = null;
    }
  })));
  methods.append(el('details', { open: methods.childElementCount ? null : '' }, el('summary', {}, 'Remote signer'),
    form, el('details', {}, el('summary', {}, 'Pair with a connection link'), label('Signer relay', relay), copy, uri, cancelPair)));
  if (signedIn) account.append(el('details', {}, el('summary', {}, 'Change signer'), methods));
  else account.append(methods);
  account.append(feedback);
  return account;
}
