from pathlib import Path
import io, zipfile, base64
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent/'web2app'
s=root.joinpath('index.html').read_text()
js=s.split('<script>')[1].split('</script>')[0]
helpers="const extensions=['png','webp','jpg','jpeg','svg','gif','avif']; const objectUrls=[];\n"+js[js.index('function fmtName('):js.index('function cleanupUrls(')]+'\n'+js[js.index('function localResourcePath('):js.index('async function openApp(')]
def make_zip():
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr('site/index.html','<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1 id="works">ZIP LAUNCHED</h1><script src="app.js"></script></body></html>')
        z.writestr('site/style.css','h1 {font-size:24px}')
        z.writestr('site/app.js','document.body.dataset.script = "yes";')
        z.writestr('site/icon.svg','<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="purple"/></svg>')
    return base64.b64encode(buf.getvalue()).decode()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    page.set_content('<iframe id="appframe" sandbox="allow-scripts allow-same-origin"></iframe>')
    payload=make_zip()
    result=page.evaluate("""async ({helpers,payload})=>{
      const bytes=Uint8Array.from(atob(payload),c=>c.charCodeAt(0));
      const test=new File([bytes],'Pack.zip',{type:'application/zip'});
      // use Function for isolated test; actual application embeds these functions in its own script.
      const run=new Function('test',helpers+`;
        return (async()=>{
          const apps=await buildCatalog([test,new File(['<h1>LOOSE</h1>'],'One.html')]);
          const pack=apps.find(x=>x.name==='Pack.zip');
          const output=await makeHTML(pack);
          return {labels:apps.map(a=>a.label), html:output.html,urls:output.urls};
        })();`);
      return await run(test);
    }""",{'helpers':helpers,'payload':payload})
    assert result['labels']==['One','Pack'],result
    assert 'ZIP LAUNCHED' in result['html']
    assert 'blob:' in result['html']
    page.evaluate("html => document.getElementById('appframe').srcdoc=html",result['html'])
    page.frame_locator('#appframe').locator('#works').wait_for(timeout=10000)
    page.frame_locator('#appframe').locator('body[data-script="yes"]').wait_for(timeout=10000)
    browser.close()
    print('PASS: deflated ZIP with nested index, CSS and JS; loose HTML without icon; in-memory ZIP playback')
