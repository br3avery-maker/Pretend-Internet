# WebToApp import

In WebToApp, go to **My Apps → ⋮ → Data Backup → Import Data** and choose
`Pretend-Internet-WebToApp.zip`. Open the project entry **Pretend Internet**
and use **Build APK** for an Android install. The archive carries one app,
its launcher icon, its local HTML project, and its WebView and APK export
settings. WebToApp deduplicates same-name HTML projects during backup import.
If this app is already present, use the existing project to preserve its data
and signing identity for updates.

The project uses System WebView, the `index.html` entry, and local HTTP on
port 17886. It keeps browser storage, uses history for Android Back, and
opens external site links in the browser. Maintain the package name
`xyz.chaoticka.pretendinternet`, port, and build signing key for updates.

To sign on the same phone, use **Publish → Connect signer → Open Amber**.
Approve the public-key request in Amber, return, and paste the key. For a
signature request, open Amber from the approval dialog, approve, return,
and paste the copied signature. Each signature is validated against the
requested event and selected account. This route uses clipboard return as
documented by NIP-55. Browser-extension and remote signer options remain
in the app.

## Rebuild the import ZIP

From `apps/nostr-hub` with Node and rsvg-convert installed:

```sh
npm ci
npm run build
rsvg-convert -w 512 -h 512 -o /tmp/pretend-internet-icon.png public/icons/icon.svg
python3 scripts/package-webtoapp.py dist /tmp/pretend-internet-icon.png /tmp/Pretend-Internet-WebToApp.zip
```

The archive follows the WebToApp v5 backup contract from
[`DataBackupManager.kt`](https://github.com/shiaho777/web-to-app/blob/c5f7071a0d2098c12f3e65c1454043cc2718c8cf/app/src/main/java/com/webtoapp/core/backup/DataBackupManager.kt).
The direct signing URL follows the existing
[MojiSurvivor handoff](https://github.com/br3avery-maker/MojiSurvivor/blob/4b941d19490c360cc87c1f4faa438fbaf83b352c/src/lib/nostrEngine.ts)
and the [NIP-55 web flow](https://github.com/nostr-protocol/nips/blob/master/55.md#using-web-applications).
The browser suite uses a disposable signer and verifies the URI, clipboard
input, cancellation, signature checks, and relay readback. Android import,
APK export, and a foreground round trip through Amber require a phone check.
