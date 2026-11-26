import { el, icon, link, route, label, button, run, status, setStatus, muted } from '../lib/dom.js';

import { exportLocalBackup, decodeBackup, restoreLocalBackup } from '../lib/backup.js';

function recoveryPanel(){
  const feedback=status(), summary=muted('Choose a backup to review its contents.'), input=el('input',{type:'file',accept:'.zip,application/zip'});
  const download=button('Export local backup',async()=>{}), review=button('Review backup',async()=>{}), restore=button('Restore missing data',async()=>{});
  restore.disabled=true;
  let prepared;
  input.addEventListener('change',()=>{prepared=undefined;restore.disabled=true;summary.textContent='Review the selected archive first.';});
  download.addEventListener('click',run(download,feedback,async()=>{
    const bytes=await exportLocalBackup();
    const href=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
    el('a',{href,download:'pretend-internet-backup-'+new Date().toISOString().slice(0,10)+'.zip'}).click();
    setTimeout(()=>URL.revokeObjectURL(href),1000);
    setStatus(feedback,'Backup bytes validated. Keep this private file somewhere safe.');
  }));
  review.addEventListener('click',run(review,feedback,async()=>{
    prepared=undefined;restore.disabled=true;
    const file=input.files[0];
    if(!file||file.size>128*1024*1024)throw Error('Choose a backup ZIP under 128 MiB.');
    const data=await decodeBackup(new Uint8Array(await file.arrayBuffer()));
    if(input.files[0]!==file)throw Error('Selection changed. Review again.');
    prepared=data;restore.disabled=false;
    summary.textContent=Object.entries(data.records).map(([name,rows])=>rows.length+' '+name).join(' · ')+' · '+Object.keys(data.settings).length+' settings';
    setStatus(feedback,'Backup validated. Restore adds missing records only; conflicts stop the restore without overwriting.');
  }));
  restore.addEventListener('click',run(restore,feedback,async()=>{
    if(!prepared)throw Error('Review a backup first.');
    await restoreLocalBackup(prepared);
    setStatus(feedback,'Restore verified by local readback. Existing identical records were retained. Reconnect your signer separately.');
  }));
  return el('section',{class:'stack'},el('h2',{},'Backup and restore'),muted('Private file: includes imported writing, drafts, staged media, collections, reading state, signed events and historical receipts. No signer connections, keys, or session settings are exported. Close other app tabs before restoring.'),download,label('Backup ZIP',input),review,summary,restore,feedback);
}

const sections = [
  ['discover', 'Discover', 'discover', 'Find published sites and projects'],
  ['arcade', 'Arcade', 'game', 'Open games from their published homes'],
  ['library', 'Bookshelf', 'book', 'Read stories, articles, and your own books'],
  ['music', 'Music', 'music', 'Play tracks and browse releases'],
  ['writing', 'Writing', 'book', 'Find and read published articles'],
  ['publish', 'Publish', 'bolt', 'Review and sign a public release'],
  ['profile', 'Profile', 'user', 'Sign in or browse other profiles'],
];
export function render(main, page) {
  if (page === 'help') {
    main.replaceChildren(el('h1', {}, 'Help'),
      el('h2', {}, 'Start anywhere'),
      el('p', {}, 'Read the two bundled Loopy Library books offline. Add a public Nostr profile to browse releases from that account, or refresh Discover to see recent signed site metadata.'),
      el('h2', {}, 'Your local data'),
      el('p', {}, 'The browser keeps your saved profiles, collections, books, bookmarks, drafts, and relay cache. Clearing site data removes them from this browser. You can export a publish receipt from Publish.'),
      recoveryPanel(),
      el('h2', {}, 'Going online'),
      el('p', {}, 'Discover looks up public nsites by npub. Open takes you to a published site. To change one of your sites, sign in from your profile, then choose Update existing nsite in Publish. Review the account, address, and file changes before signing.'),
      link('Back to Home', route('index'), 'button'));
    return;
  }
  main.replaceChildren(
    el('header', { class: 'home-heading stack-tight' }, el('h1', { class: 'tape' }, 'Pretend Internet'),
      el('p', { class: 'muted' }, 'Find a place, play something, or pick up where you left off.')),
    el('nav', { class: 'home-nav', 'aria-label': 'Places' }, sections.map(([page, title, symbol, description]) =>
      el('a', { href: route(page), class: 'destination' }, icon(symbol), el('span', {}, el('strong', {}, title), el('small', {}, description)), icon('right')))));
}
