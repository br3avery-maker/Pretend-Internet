# WebToApp import

In WebToApp, go to **My Apps → ⋮ → Data Backup → Import Data** and choose
`Pretend-Internet-WebToApp-0.2.1.zip`. Use **Build APK** on the new
**Pretend Internet 0.2.1** project. Its versioned name lets WebToApp import
the project alongside the earlier same-package project. It carries the
launcher icon, local app files, WebView settings, and APK settings.

The project uses System WebView and local HTTP on port 17886. It keeps
browser storage, uses history for Android Back, and opens external site
links in the browser. Its Android version code is 3. An in-place APK
update requires the original signing key and package name
`xyz.chaoticka.pretendinternet`. APK update and data preservation still
need an Android device check. Keep the older project while testing.

In the installed export, tap **Profile → Sign in → Sign in with Amber**.
Choose your account in Amber. Amber returns the public key to the
profile screen. Publish uses that account and opens Amber only to
approve a signature. After approval Amber returns to the open review.
If you decline in Amber, return to the app and close the approval request.
The app validates the signature against the exact request and account.
Sign-out and switching accounts are on the profile screen.

This uses WebToApp’s exported custom scheme `pretend-internet-amber`.
The in-builder preview can display the web UI but does not register a
project-specific Android scheme. Ordinary browser builds can use an
extension or a remote signer.

## Rebuild the import ZIP

From `apps/nostr-hub` with Node and rsvg-convert installed:

```sh
npm ci
npm run build
rsvg-convert -w 512 -h 512 -o /tmp/pretend-internet-icon.png public/icons/icon.svg
python3 scripts/package-webtoapp.py dist /tmp/pretend-internet-icon.png /tmp/Pretend-Internet-WebToApp-0.2.1.zip \
  --version-code 3 --project-name "Pretend Internet 0.2.1"
```

The archive follows the WebToApp v5 backup contract from
[`DataBackupManager.kt`](https://github.com/shiaho777/web-to-app/blob/c5f7071a0d2098c12f3e65c1454043cc2718c8cf/app/src/main/java/com/webtoapp/core/backup/DataBackupManager.kt).
The Android return uses [WebToApp’s shell deep-link dispatcher](https://github.com/shiaho777/web-to-app/blob/e75a8602b4a7eb3ba362a3f34ee3ae95e7697f2c/app/src/main/java/com/webtoapp/ui/shell/ShellUtils.kt)
and forwards the loopback page’s fragment rather than sending an approval to a remote service.
The direct signing URL follows the existing
[MojiSurvivor handoff](https://github.com/br3avery-maker/MojiSurvivor/blob/4b941d19490c360cc87c1f4faa438fbaf83b352c/src/lib/nostrEngine.ts)
and the [NIP-55 web flow](https://github.com/nostr-protocol/nips/blob/master/55.md#using-web-applications).
The packaged browser fixture simulates WebToApp dispatch of the Amber
return URL and exercises account selection, cancellation, signature and
nonce checks, and authenticated relay readback. Android import, APK export,
and a foreground round trip through Amber require a phone check.
