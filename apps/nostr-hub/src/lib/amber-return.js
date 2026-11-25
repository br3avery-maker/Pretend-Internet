import { el, link, modal, status, setStatus } from './dom.js';

const marker = '#amber-return=';
const scheme = 'pretend-internet-amber';

export const supportsAmberReturn = () => document.querySelector('meta[name="pretend-amber-return"]')?.content === scheme
  && location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname);

function callbackURL(id) {
  const page = new URL(location.href);
  page.hash = marker.slice(1) + id + ':';
  // WebToApp routes the embedded URL back to this exact document and origin.
  return scheme + '://oauth-return?url=' + encodeURIComponent(page.href);
}

function request(makeURI, validate, signal, open) {
  if (signal?.aborted) return Promise.reject(new Error('Amber account disconnected.'));
  const id = crypto.randomUUID();
  const prefix = marker + id + ':';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Amber did not return an approval. Try again.')), 120000);
    const cancel = () => finish(new Error('Amber request cancelled.'));
    let done = false;
    function finish(error, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('hashchange', receive);
      signal?.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve(result);
    }
    function receive() {
      const hash = location.hash;
      if (!hash.startsWith(marker)) return;
      discardStaleAmberReturn();
      if (!hash.startsWith(prefix)) return;
      try { finish(null, validate(decodeURIComponent(hash.slice(prefix.length)))); }
      catch (error) { finish(error); }
    }
    window.addEventListener('hashchange', receive);
    signal?.addEventListener('abort', cancel, { once: true });
    try { open(makeURI(callbackURL(id)), cancel); }
    catch (error) { finish(error); }
  });
}

// A stale result after a WebView restart cannot authorize a paused operation.
export function discardStaleAmberReturn() {
  if (location.hash.startsWith(marker)) {
    history.replaceState(history.state, '', location.pathname + location.search);
    return true;
  }
  return false;
}

export function connectAmber(makeURI, verify, launch) {
  if (!supportsAmberReturn()) throw new Error('Open the installed Pretend Internet app to sign in with Amber.');
  return request(makeURI, verify, undefined, launch);
}

export async function approveAmber(makeURI, signal, verify) {
  if (!supportsAmberReturn()) throw new Error('Open the installed Pretend Internet app or select another signer from your profile.');
  let dialog;
  try {
    return await request(makeURI, verify, signal, (href, cancel) => {
      const feedback = status();
      const open = link('Open Amber', href, 'button primary');
      open.addEventListener('click', () => setStatus(feedback, 'Approve in Amber. If you decline, return here and close this request.'));
      dialog = modal('Approve in Amber', 'sheet', el('p', {}, 'Amber returns the approval to this page.'), open, feedback);
      dialog.addEventListener('close', cancel, { once: true });
      dialog.showModal();
    });
  } finally {
    dialog?.close();
    dialog?.remove();
  }
}
