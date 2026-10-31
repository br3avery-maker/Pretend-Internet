import {rpc,message} from './archive-client.js';
let started=false,running=false;
import {capture} from './screenshot.js';

async function prepare(){if(running||document.hidden)return;running=true;let more=false;try{const candidates=await rpc('previewCandidates');for(const c of candidates){try{const rendered=await rpc('render',{site:c.id}),image=await capture(rendered.html);await rpc('savePreview',{hash:c.hash,image});more=true;for(const img of document.querySelectorAll('[data-preview-hash]'))if(img.dataset.previewHash===c.hash){img.src=image;img.hidden=false;img.nextElementSibling?.setAttribute('hidden','');}}catch(e){if(/quota|storage/i.test(e.message))message('Phone storage is low. Back up the archive before saving more previews.');try{await rpc('savePreview',{hash:c.hash,error:e.message});more=true;}catch{}}}}catch{}finally{running=false;if(more)setTimeout(prepare,500);}}
export function startPreviews(){if(started)return;started=true;window.addEventListener('pagecontent',prepare);window.addEventListener('archivechange',prepare);setTimeout(prepare,1500);setInterval(prepare,10000);}
