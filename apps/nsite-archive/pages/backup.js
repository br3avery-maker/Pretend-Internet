import {app,escape,short,date,route,back,lastLibrary,filePicker,noData,siteRow,mount} from '../ui.js';
import {rpc,operation} from '../archive-client.js';
import { storage } from '../storage.js';

async function renderPage(){
  const params=new URLSearchParams(location.search),refresh=true;
  app.innerHTML=`<h1>Backup & recovery</h1><p>Full backups contain original signed events, provenance, jobs, and verified file bytes. Restore merges validated records without deleting your current archive.</p><div class="actions"><button class="primary" data-write data-action="exportArchive">Export full archive</button>${filePicker('archive-import','Import full archive')}</div><h2>Directory index</h2><p class="muted">A lightweight index is useful for browsing and sharing metadata. It does not contain the bytes needed to restore an archive.</p><button data-write data-action="directory">Export directory index</button><h2>Storage</h2><p id="storage-status" class="muted">Checking storage…</p><button data-action="persist">Request persistent storage</button><p class="muted">Keep separate backups. Browser storage belongs to this origin; moving to a different gateway or APK origin requires export and import.</p>`;
  await storage();
  document.querySelector('[data-action="persist"]').onclick=()=>storage(true);
}
mount(renderPage);
