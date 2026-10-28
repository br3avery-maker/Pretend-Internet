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
print('PASS: manifest permissions, persistent SAF, ZIP streaming, distinct app storage origins, WebView file chooser, UI sync')
