export async function capture(html){
 const doc=new DOMParser().parseFromString(html,'text/html');const headStyles=[...doc.head.querySelectorAll('style')].map(s=>s.outerHTML).join('');
 const wrap=doc.createElement('div');wrap.setAttribute('xmlns','http://www.w3.org/1999/xhtml');wrap.style.cssText='width:390px;min-height:640px;background:white;color:black;font:16px sans-serif;overflow:hidden';wrap.innerHTML=headStyles+doc.body.innerHTML;
 const xhtml=new XMLSerializer().serializeToString(wrap),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="390" height="640"><foreignObject width="390" height="640">${xhtml}</foreignObject></svg>`;
 const img=new Image();await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Preview rendering timed out.')),8000);img.onload=()=>{clearTimeout(timeout);resolve();};img.onerror=()=>{clearTimeout(timeout);reject(Error('This browser cannot render the archived preview.'));};img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
 const canvas=document.createElement('canvas');canvas.width=390;canvas.height=640;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,390,640);ctx.drawImage(img,0,0);return canvas.toDataURL('image/png');
}
