# Folder Launcher v0.2.0 — Android APK source

Use Android Studio (JDK 17, Gradle 8.9, AGP 8.7.3, SDK 35). Open this `android-app` folder, sync, and **Build > Build APK(s)**. Your debug APK is at `app/build/outputs/apk/debug/app-debug.apk`.

**Permissions are already configured. Do not add broad Android storage permissions.** `app/src/main/AndroidManifest.xml` declares only `INTERNET` for optional remote resources. Android's system folder picker grants persisted read-only access to the one app directory you select; it is not a standard runtime permission prompt. No user-adjusted manifest settings are required.

Once installed: gear -> Choose folder -> Android system picker -> Use this folder. Drop root-level HTML + optional matching image, or ZIP containing an HTML site, into that folder. Refresh / reopen the launcher to see apps. ZIPs are streamed via `ZipInputStream` on demand; there is no persistent extraction.

Separate app WebViews use per-app virtual HTTPS origins and cannot call the trusted shell's native JavaScript bridge. Storage persists per app. The WebView supports user-initiated file `<input>` pickers. Native APK build and device testing have not yet been performed in this environment.
