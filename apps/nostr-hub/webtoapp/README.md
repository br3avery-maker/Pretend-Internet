# WebToApp import

In WebToApp, go to **My Apps → ⋮ → Data Backup → Import Data** and choose
`Pretend-Internet-WebToApp-0.2.0.zip`. Use **Build APK** on the new
**Pretend Internet 0.2.0** project. Its versioned name lets WebToApp import
the project alongside the earlier same-package project. It carries the
launcher icon, local app files, WebView settings, and APK settings.

The project uses System WebView and local HTTP on port 17886. It keeps
browser storage, uses history for Android Back, and opens external site
links in the browser. Its Android version code is 2. An in-place APK
update requires the original signing key and package name
`xyz.chaoticka.pretendinternet`. APK update and data preservation still
need an Android device check. Keep the older project while testing.

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
python3 scripts/package-webtoapp.py dist /tmp/pretend-internet-icon.png /tmp/Pretend-Internet-WebToApp-0.2.0.zip \
  --version-code 2 --project-name "Pretend Internet 0.2.0"
```

The archive follows the WebToApp v5 backup contract from
[`DataBackupManager.kt`](https://github.com/shiaho777/web-to-app/blob/c5f7071a0d2098c12f3e65c1454043cc2718c8cf/app/src/main/java/com/webtoapp/core/backup/DataBackupManager.kt).
The direct signing URL follows the existing
[MojiSurvivor handoff](https://github.com/br3avery-maker/MojiSurvivor/blob/4b941d19490c360cc87c1f4faa438fbaf83b352c/src/lib/nostrEngine.ts)
and the [NIP-55 web flow](https://github.com/nostr-protocol/nips/blob/master/55.md#using-web-applications).
The browser suite uses a disposable signer and verifies the URI, clipboard
input, cancellation, signature checks, and relay readback. Android import,
APK export, and a foreground round trip through Amber require a phone check.
