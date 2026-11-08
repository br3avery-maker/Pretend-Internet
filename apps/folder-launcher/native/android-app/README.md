# Folder Launcher v0.2.0 — Android APK source

Use Android Studio (JDK 17, Gradle 8.9, AGP 8.7.3, SDK 35). Open this `android-app` folder, sync, and **Build > Build APK(s)**. Your debug APK is at `app/build/outputs/apk/debug/app-debug.apk`.

**Permissions are already configured. Do not add broad Android storage permissions.** `app/src/main/AndroidManifest.xml` declares only `INTERNET` for optional remote resources. Android's system folder picker grants persisted read-only access to the one app directory you select; it is not a standard runtime permission prompt. No user-adjusted manifest settings are required.

Once installed: gear -> Choose folder -> Android system picker -> Use this folder. Drop root-level HTML + optional matching image, or ZIP containing an HTML site, into that folder. Refresh / reopen the launcher to see apps. ZIPs are streamed via `ZipInputStream` on demand; there is no persistent extraction.

Separate app WebViews use per-app virtual HTTPS origins, scoped by the chosen folder, and cannot call the trusted shell's native JavaScript bridge. Storage persists per app. A loose app's origin only executes its own entry HTML; other HTML pages are refused so apps cannot frame one another. The WebView supports user-initiated file `<input>` pickers.

**Build status:** a clean `gradle clean :app:assembleDebug` succeeds with JDK 17.0.21+9, Gradle 8.9, AGP 8.7.3 and SDK 35. Verified debug APK SHA-256: `05a5ffa8d718d953c6f041da776ebd7af73bf15330161d3a1223a5c4153200e2`. It is signed with the Android Debug certificate via APK Signature Scheme v2 and declares only `INTERNET`.

**Device testing has not been performed.** No Android device or usable emulator was available, so installation, SAF persistence after restart/reboot, ZIP runtime, per-app storage, Android Back navigation, rotation and update signing remain unverified. The parent [README](../README.md) lists the required device checks.
