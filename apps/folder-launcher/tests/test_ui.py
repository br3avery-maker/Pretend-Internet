from pathlib import Path
import base64
import json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
html=(root/'web2app/index.html').read_text()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
    failures=[]
    page.on('pageerror',lambda x:failures.append(str(x)))
    def icon(bg, glyph):
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" rx="22" fill="{bg}"/><text x="50" y="67" text-anchor="middle" fill="white" font-size="53" font-family="Arial">{glyph}</text></svg>'
        return 'data:image/svg+xml;base64,'+base64.b64encode(svg.encode()).decode()
    apps=[{'id':'loose:Mojisurvivor.html','label':'Mojisurvivor','iconUrl':icon('#8523a7','M')},{'id':'zip:Music Player.zip','label':'Music Player','iconUrl':icon('#bb1c65','♫')}]
    page.evaluate("apps => {window.AndroidLauncher={listApps:()=>JSON.stringify(apps),folderName:()=>'Connected Android folder',chooseFolder:()=>{},launchApp:(name)=>{window.lastLaunched=name}}}",apps)
    page.set_content(html,wait_until='load')
    page.wait_for_function("document.querySelectorAll('.tile').length === 2")
    assert page.locator('.tile').count()==2
    page.screenshot(path=str(root/'launcher-preview.png'))
    page.locator('.tile').first.click()
    assert page.evaluate('window.lastLaunched')=='loose:Mojisurvivor.html'
    page.evaluate('window.onNativeAppReturned()')
    assert page.locator('#player.active').count()==0
    page.locator('#gear').click()
    assert page.locator('#shade.show').count()==1
    assert not failures,failures
    print('PASS: blank-shell grid, icon pairing native catalog rendering, click-to-launch, return, settings')
    browser.close()
