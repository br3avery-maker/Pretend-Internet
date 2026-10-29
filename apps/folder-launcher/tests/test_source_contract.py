from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree
root=Path(__file__).resolve().parent.parent
m=root/'native/android-app/app/src/main/AndroidManifest.xml'
src=root/'native/android-app/app/src/main/java/xyz/chaoticka/folderlauncher/MainActivity.java'
ns='{http://schemas.android.com/apk/res/android}'
perms=[x.get(ns+'name') for x in ElementTree.parse(m).getroot().findall('uses-permission')]
assert perms==['android.permission.INTERNET'],perms
java=src.read_text()
for expr in ['ACTION_OPEN_DOCUMENT_TREE','takePersistableUriPermission','ZipInputStream','readZipEntry','"loose:"','"zip:"','appHosts','onShowFileChooser','setDomStorageEnabled(true)']:
    assert expr in java,expr
assert 'READ_EXTERNAL_STORAGE' not in m.read_text().replace('<!-- No READ_EXTERNAL_STORAGE, MANAGE_EXTERNAL_STORAGE or runtime media grant. The system folder picker grants narrow persistent read access. -->','')
assert (root/'web2app/index.html').read_bytes()==(root/'native/android-app/app/src/main/assets/index.html').read_bytes()
# The browser fixture must represent the exact JavaScript shipped by both launchers.
import re
embedded_scripts=re.findall(r'<script>([\\s\\S]*?)</script>',(root/'web2app/index.html').read_text())
assert len(embedded_scripts)==1, 'Expected one embedded launcher script'
assert (root/'tests/launcher.js').read_text().strip()==embedded_scripts[0].strip(), 'Browser fixture drifted from shipped launcher'
# The Android catalog emits id, which must survive mapping into the JS bridge.
assert 'data.put("id",a.id)' in java, 'Native catalog must emit app id'
assert 'entries=list.map(x=>({name:x.id,' in embedded_scripts[0], 'Native app id lost in JS mapping'
assert 'window.AndroidLauncher.launchApp(app.name)' in embedded_scripts[0], 'JS must pass app id to native bridge'
assert 'apps.get(id)' in java, 'Native bridge must resolve app id'
print('PASS: manifest, SAF, ZIP, per-app origins, file chooser, UI sync, JS fixture and native ID bridge')
