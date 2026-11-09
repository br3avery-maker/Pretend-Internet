# Folder Launcher v0.2.0 — HTML + ZIP apps

An offline-first, empty Android icon launcher that discovers standalone HTML pages and packaged ZIP websites from one chosen phone folder. No account, registry, network catalog, or APK rebuild when you add an app.

**Status: live — owner-confirmed installed-device verification (2026-11-09).** The debug APK builds cleanly, the source/browser tests pass, and the owner confirmed that installed-device verification is complete, including the remaining [Issue #11](https://github.com/br3avery-maker/Pretend-Internet/issues/11) acceptance checks. On 2026-11-08 the owner supplied Android screenshots showing a populated four-column launcher grid with five app entries and a bottom-right settings gear matching the shipped shell source, and confirmed that Deepink is one of the apps opened from it. The 2026-11-09 confirmation is an owner attestation: no phone model, Android version, install receipt, or additional screenshots were supplied, and no independent device instrumentation was captured. The tested repository APK is recorded below.

## What to drop in the folder

Create a directory such as `Documents/Apps` and put files directly inside it:

```text
Documents/Apps/
  Mojisurvivor.html          <- app (image optional)
  Mojisurvivor.png           <- matching launcher icon
  Music Player.zip           <- app, left zipped
  Music Player.webp          <- optional matching launcher icon
  notes.html                 <- app, uses fallback icon
  site-assets/               <- loose HTML's supporting images/CSS/JS
```

Any `.html`/`.htm` becomes an app, **even without a same-named picture**. Matching images (`.png`, `.webp`, `.jpg`, `.jpeg`, `.svg`, `.gif`, `.avif`) become its icon. Every root-level `.zip` containing a root `index.html`, nested `index.html`, or exactly one HTML file becomes another app. ZIPs can include CSS, JavaScript, media and subdirectories. A same-stem picture next to the ZIP overrides the internal icon; otherwise the ZIP's `icon.*`, `favicon.*`, `app.*`, or `cover.*` is preferred (fallback is a plain tile).

Files are read directly from the chosen folder. ZIP resources are decompressed into **memory only as needed**, not extracted to permanent files. Update a ZIP in place or delete it; refresh or return to the launcher to rebuild icons. Root folder files are apps; subfolders are available as assets for standalone HTML pages.

## Choose which build

**`FolderLauncher-Android-Source.zip` — recommended for actual automatic folder scanning.** Unzip the source to build it in Android Studio. This Android project contains the permission manifest, persisted read-only folder picker, ZIP reader, full-screen WebView player, support for HTML `<input type="file">` pickers, and per-app web origins for separate localStorage/IndexedDB. It does **not** require you to edit a permission or copy a manifest.

**`FolderLauncher-Web2App.zip` — Web2App-ready HTML package.** The root `index.html` can be supplied to an HTML-to-APK builder. It accepts both HTML and ZIP through the **Import HTML, images or ZIPs** picker, and persists imported copies in IndexedDB. It can scan a chosen folder automatically **only if the particular Web2App WebView supports and preserves a File System Access directory handle**; most generic HTML wrappers cannot. For fallback ZIP previews, it supports common stored/deflated ZIP members and ordinary relative resources, but not all module import chains, dynamic `fetch()`, service workers, or server-backed apps. A ZIP imported here is stored as one ZIP file, not extracted on Android.

**`FolderLauncher-Full-Source.zip`** includes both packages, documentation and test scripts.

## Android installation and permissions — already configured

In the compiled **native Android edition**:

1. Launch `Apps` once.
2. Tap the small gear -> **Choose folder**.
3. Pick your app folder with Android's normal system folder picker; tap **Use this folder** and approve read access if Android asks.
4. Drop HTML/PNG/ZIP files there in your Android file manager. Reopen the launcher, or press **Refresh icons**.

That is the entire permission flow. The launcher stores the URI and calls `takePersistableUriPermission` to remember read access. You do **not** need to hunt for Storage permissions in Android Settings. `READ_EXTERNAL_STORAGE`, `MANAGE_EXTERNAL_STORAGE`, and media library permissions are not needed and not declared. `INTERNET` *is* declared at build time, with no runtime prompt, so HTML apps with web/CDN references can work when online. The launcher itself does not need Internet to discover or serve locally stored apps.

A generic Web2App HTML-to-APK converter cannot be made to scan a chosen Android folder merely by adding a permission line to HTML. That needs a capable wrapper with the Android Storage Access Framework integration. **Native source is the reliable APK build for that requirement.** Custom camera/microphone apps require additional features/permissions and are intentionally not broadly enabled by default.

## Build the native APK

Verified from a clean tree on 2026-11-08 and rebuilt on 2026-11-09 with JDK 17.0.21+9 (Temurin), Gradle 8.9, Android Gradle Plugin 8.7.3, Android SDK Platform 35 and Build-Tools 35.0.0.

Install `platforms;android-35`, `build-tools;35.0.0` and `platform-tools` with `sdkmanager`, then:

```sh
export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=/path/to/android-sdk
cd apps/folder-launcher/native/android-app
gradle clean :app:assembleDebug --no-daemon
```

Output: `app/build/outputs/apk/debug/app-debug.apk`. The original verified workspace build is 32,780 bytes with SHA-256 `05a5ffa8d718d953c6f041da776ebd7af73bf15330161d3a1223a5c4153200e2` (also delivered as `FolderLauncher-0.2.0-debug.apk` outside source control). The repository's checked-in CI build is recorded below. Package `xyz.chaoticka.folderlauncher`, versionCode 2 / versionName 0.2.0, minSdk 26, targetSdk 35, only the `INTERNET` permission. APK Signature Scheme v2, Android Debug certificate SHA-256 `68946a354f6db9e25c5a8929513fcd033ac8a28f78b139374210de9fc4f5b885`.

Android Studio: open `native/android-app` (or `android-app` inside the Android source ZIP), sync, and choose **Build > Build APK(s)**. Allow it to install missing SDK packages. No manifest edits are required.

**Signing and updates:** the debug APK is installable for local testing but uses the debug key. A build on another machine uses a different debug key, so Android rejects in-place updates (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) and uninstalling loses app browser storage. For updates you want to keep, use one stable private keystore and raise `versionCode`. Do not commit a keystore.

## Boundary / safety

- ZIP loading is local and does not run native programs. A ZIP must contain browser-compatible web files.
- ZIP member reads are capped to 32 MiB per member, 4,000 entries per archive and 128 MiB of total decompression while scanning. Skipped members are drained through the same bound. ZIP64 and encrypted ZIPs are not supported.
- The Android player opens websites in WebViews **without** the native launcher JavaScript bridge, using a unique HTTPS origin per app and per chosen folder so browser storage does not collide. A loose app origin executes only its own entry HTML; other HTML pages in the folder are refused, preventing one app from framing another app's page. A loose HTML app can still request non-HTML files in its selected folder; don't drop sensitive files there.
- The Web2App-only fallback uses an iframe/Blob-based compatibility mode; complex sites should use the native project for better URL, fetch and storage support. Fallback pages are not isolated per app.
- No cloud upload, analytics, or hardcoded app list.

## Verified in this build environment

- `node --test apps/folder-launcher/tests/test_*.js`: **38/38 pass**.
- `python3 apps/folder-launcher/tests/test_source_contract.py`: pass (manifest, SAF, ZIP bounds, per-app origins, folder identity, Help, empty state, fixture synchronization, native ID bridge).
- Chromium 156.0.8078.4 `test_ui.py`: pass (390x844 shell grid, icon launch, return, settings).
- Chromium `test_zip_ui.py`: pass (deflated ZIP with nested `index.html`, CSS, JavaScript, image; loose HTML without icon; in-memory ZIP playback).
- `gradle clean :app:assembleDebug`: pass. `apksigner verify`: APK Signature Scheme v2; only `INTERNET` permission.
- Repository `npm ci && npm run build && npm run check`: pass.
- Packaged APK contains `assets/index.html`, `classes.dex` and the `AndroidManifest.xml` with launchable `MainActivity`.

**Installed-device verification (owner-attested, 2026-11-09):** On 2026-11-09 the owner confirmed that installed-device verification is complete, including the remaining [Issue #11](https://github.com/br3avery-maker/Pretend-Internet/issues/11) acceptance checks: exact installed package/version identity, fresh-install empty state, SAF permission persistence through app restart and device reboot, HTML and ZIP launch with nested assets, per-app localStorage/IndexedDB isolation, Android Back/rotation/process-death behavior, the HTML file chooser, malformed/encrypted/oversized ZIP handling, and the Web2App fallback. This entry records the owner's attestation, not independently captured instrumentation. No phone model, Android version, install receipt, or additional screenshots were supplied for this confirmation; the 2026-11-08 screenshots remain the only captured device observation.

**Repository APK identity:** [`artifacts/folder-launcher/FolderLauncher.apk`](../../artifacts/folder-launcher/FolderLauncher.apk) is the checked-in CI-built debug APK: 32,784 bytes, SHA-256 `0592b8da2faa07dd8e32964fdd3667d784782a847bc3ba6d36324c41f1b30dfa`, SHA-512 `2d871e8aa8b407a901457d5376179aa649baf9cf636e019638df052070f9f96ea03c82bdd52bfa24e747fe5eeb96779d6c1894cde7aed50a4596124eabf26324`, package `xyz.chaoticka.folderlauncher`, versionCode 2 / versionName 0.2.0. A clean local build from this source also succeeds and produces SHA-256 `05a5ffa8d718d953c6f041da776ebd7af73bf15330161d3a1223a5c4153200e2`; debug builds from different environments are not required to be byte-identical.

**Distribution limitation:** the checked-in APK is debug-signed. Use one stable private keystore and raise `versionCode` before distributing updates; do not commit a signing key.

## GitHub-built APK stored in the repository

The owner requested an intentionally **checked-in testing APK**, as an exception to the normal generated-file ignore policy. The [Build Folder Launcher APK workflow](../../.github/workflows/build-folder-launcher-apk.yml) runs when the native Android project changes on `main` or when started manually through GitHub Actions. It builds with Java 17, Gradle 8.9, and Android SDK 35; verifies the APK signature and package name; uploads a downloadable Actions artifact; and commits the verified binary and checksums to:

- [`artifacts/folder-launcher/FolderLauncher.apk`](../../artifacts/folder-launcher/FolderLauncher.apk)
- [`artifacts/folder-launcher/CHECKSUMS.txt`](../../artifacts/folder-launcher/CHECKSUMS.txt)
- `artifacts/folder-launcher/SOURCE_TREE.txt` — the source-tree identity used to avoid rewriting an unchanged build

**Verified:** GitHub Actions [run 42533397460](https://github.com/br3avery-maker/Pretend-Internet/actions/runs/42533397460) succeeded; [bot commit `9b5494b`](https://github.com/br3avery-maker/Pretend-Internet/commit/9b5494b8d3ac101b1e2f38657fdaf560881e5d14) contains the APK and checksums. The committed APK SHA-256 `0592b8da2faa07dd8e32964fdd3667d784782a847bc3ba6d36324c41f1b30dfa` was independently matched to the committed checksum. The historical SHA-256 recorded earlier in this README is for the original agent-built APK, not a promise that a fresh CI build has the same bytes. Validate downloaded APKs against the `CHECKSUMS.txt` beside that specific APK.

The workflow currently creates a **debug-signed testing APK**. Its signing certificate is generated by the build environment, so later rebuilds using a different debug key might **not** install over an existing installation. To preserve app data across upgrades, provision one private, stable signing key through GitHub Actions secrets or another secured signing workflow **before** treating these testing builds as upgradeable releases. Never commit a production signing key to this public repository. The source-tree check avoids needlessly replacing the repository APK when only the workflow is rerun without source changes.

The workflow is build/distribution automation only: it does **not** by itself establish installed-Android verification, and it does not deploy or publish an nsite. The installed-device status above comes from the owner's 2026-11-09 confirmation, not from this workflow.
