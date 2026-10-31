import {app,escape,route,back,mount} from '../ui.js';
import {rpc} from '../archive-client.js';
async function render(){const params=new URLSearchParams(location.search),site=params.get('site');const data=await rpc('render',{site,path:params.get('path')||undefined,version:params.get('version')||undefined});app.innerHTML=`${back(route('site',{site}))}<h1>${escape(data.title)}</h1><iframe class="saved-site" title="Saved ${escape(data.title)}" sandbox="allow-top-navigation-by-user-activation"></iframe><p class="stats">Saved HTML · scripts disabled${data.missing?' · '+data.missing+' resources unavailable':''}</p>`;document.querySelector('iframe').srcdoc=data.html;}
mount(render);
