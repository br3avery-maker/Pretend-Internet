const symbols = {
  home: '<path d="m3 11 9-8 9 8v9H3z"/><path d="M9 20v-6h6v6"/>',
  discover: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  book: '<path d="M12 6v15M3 4h5c2 0 4 1 4 3 0-2 2-3 4-3h5v15h-5c-2 0-4 1-4 2 0-1-2-2-4-2H3z"/>',
  game: '<path d="M7 7h10a4 4 0 0 1 4 3l1 5a3 3 0 0 1-5 3l-2-2H9l-2 2a3 3 0 0 1-5-3l1-5a4 4 0 0 1 4-3Z"/><path d="M6 11h4m-2-2v4m7-1h.1m3 0h.1"/>',
  music: '<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/>',
  user: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  network: '<path d="m12 11-5 10m5-10 5 10m-8-4h6M8 5a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M5 2a10 10 0 0 0 0 14m14-14a10 10 0 0 1 0 14"/><circle cx="12" cy="9" r="1"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8z"/>',
  settings: '<path d="M4 7h16M4 12h16M4 17h16"/><path d="M8 5v4m8 1v4m-7 1v4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  list: '<path d="M5 6h14M5 12h14M5 18h14"/>',
  save: '<path d="M6 4h12v16l-6-4-6 4z"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
};
export function icon(name) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const attrs = { viewBox: '0 0 24 24', class: 'icon', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.innerHTML = symbols[name] ?? symbols.bolt;
  return node;
}
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (['hidden', 'disabled', 'checked', 'required', 'multiple', 'readOnly'].includes(key)) node[key] = Boolean(value);
    else if (value != null && value !== false) node.setAttribute(key, String(value));
  }
  node.append(...children.flat(Infinity).filter(value => value != null && value !== false));
  return node;
}
export const button = (text, action, className = '') => el('button', { type: 'button', class: className, onclick: action }, text);
export const iconButton = (name, label, action) => el('button', { type: 'button', class: 'icon-button', 'aria-label': label, title: label, onclick: action }, icon(name));
export const link = (text, href, className = '') => el('a', { href, class: className }, text);
export const route = (name, values = {}) => {
  const params = new URLSearchParams(Object.entries(values).filter(([,value]) => value != null));
  return `./${name}.html${params.size ? '?' + params : ''}`;
};
export const query = new URLSearchParams(location.search);
export const label = (title, control) => el('label', {}, title, control);
export const muted = text => el('p', { class: 'muted' }, text);
export const status = text => el('p', { role: 'status', class: 'notice', hidden: !text }, text || '');
export function setStatus(node, text) { node.textContent = text; node.hidden = !text; }
export const heading = (title, ...actions) => el('header', { class: 'split' }, el('h1', {}, title), actions.length > 0 && el('div', { class: 'row' }, actions));
export function modal(title, className, ...content) {
  const node = el('dialog', { class: className, 'aria-label': title },
    el('div', { class: 'stack' }, el('div', { class: 'dialog-heading' }, el('h2', {}, title), iconButton('close', 'Close', () => node.close())), content));
  node.addEventListener('click', event => { if (event.target === node && !node.dataset.busy) node.close(); });
  document.body.append(node);
  return node;
}
export function run(control, message, action) {
  return async event => {
    event?.preventDefault();
    control.disabled = true;
    try { await action(event); }
    catch (error) { setStatus(message, error.message || 'Something went wrong.'); }
    finally { control.disabled = false; }
  };
}
