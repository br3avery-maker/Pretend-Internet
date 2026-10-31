# Folder Launcher v0.2.0 — HTML + ZIP apps

An offline-first, empty Android icon launcher that discovers standalone HTML pages and packaged ZIP websites from one chosen phone folder. No account, registry, network catalog, or APK rebuild when you add an app.

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

Open `native/android-app` (or `android-app` inside the Android source ZIP) in Android Studio with JDK 17, Android Gradle Plugin 8.7.3, Gradle 8.9, Android SDK 35. Sync and choose **Build > Build APK(s)**; the debug APK appears at `app/build/outputs/apk/debug/app-debug.apk`. If Android Studio offers to install required SDK packages, allow it. No manifest edits required. The release is source-only; an Android SDK is not installed in this authoring environment and no APK has been compiled or phone-tested here.

When sharing an updated APK to the same phone, use the same signing identity and raise `versionCode`. This version is 2 / 0.2.0. A debug APK is intended for local testing.

## Boundary / safety

- ZIP loading is local and does not run native programs. A ZIP must contain browser-compatible web files.
- ZIP member reads are capped to 32 MiB per member, with 4,000 entries scanned per archive. ZIP64 and encrypted ZIPs are not supported by the browser fallback.
- The Android player opens websites in WebViews **without** the native launcher JavaScript bridge, using a unique HTTPS origin per app so their browser storage does not collide. A loose HTML app can still request other files in its selected folder; don't drop sensitive files there.
- The Web2App-only fallback uses an iframe/Blob-based compatibility mode; complex sites should use the native project for better URL, fetch and storage support.
- No cloud upload, analytics, or hardcoded app list.

## Checks performed

- Node.js syntax and matching-pairs tests.
- Chromium UI test (390x844) for shell rendering, icon launch, return, settings.
- Chromium ZIP test: deflated archive with nested `index.html`, CSS, JavaScript, image, and loose HTML with no icon, rendered directly from an in-memory ZIP.
- Manifest XML and packaged ZIP layout validation.

The Android Java source has not been compiled or run on a phone in this environment. That still needs testing before declaring the APK ready to install.
