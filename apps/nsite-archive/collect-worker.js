import {runQueue} from './collector.js';
let active,abort;self.onmessage=({data})=>{if(data.type==='pause'){abort?.abort();return;}if(data.type==='collect'&&!active){abort=new AbortController();active=runQueue({signal:abort.signal,onProgress:value=>self.postMessage({type:'progress',value})}).finally(()=>{active=null;self.postMessage({type:'idle'});});}};
