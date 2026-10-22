# Native Layout Lab — WIP, not a shipped app

Four **React Native** interface experiments in a separate Expo app: Shell, Files, Reader, and Player. This is not a replacement for the repository's existing WebToApp static frontend. No legacy UI or personal Library content was imported.

## Run on an Android phone

The Expo documentation recommends **SDK 57 for current Expo Go on a physical device** during the SDK 58 transition. This experiment pins SDK 57. Install Node >=22.13 on the machine running the dev server, then:

```sh
cd experiments/native-layout-lab
npm install
npx expo install --check
npm run typecheck
npm start
```

Open the development server in Expo Go, using the QR code. A computer running the dev server and phone must be able to reach each other. No APK has been generated, installed, or tested yet. The root repository's `npm run build` is for the existing WebToApp frontend, **not this native experiment**.

## What works

- Switch among four views; choose Ink/Paper skin and Compact/Relaxed density from Shell.
- Filter, sort, and browse a **bundled virtual file shelf** (list/grid). Opening a sample text goes to Reader; a sample track opens Player.
- Reader: multiple sample chapters, left/right swipe, next/previous buttons, font-size adjustments, focus mode hiding chrome.
- Player: select tracks in sample queue, view per-track notes. Playback is **intentionally disabled** because no audio file or audio engine is bundled.
- Help on each layout explains purpose, sample data, and limitations.

## What does not work yet

This does **not** read device storage, share content across installed apps, browse actual files, play media, install apps, replace Android launcher, or prove a native APK build. Those are separate future experiments after the layouts are reviewed. No internet, account, backend, device permission, or publishing feature is needed by the interface itself.

## Evaluation checklist

- [ ] Run on a real phone with Expo Go; record device/OS and install result.
- [ ] Test 320–440 dp widths, large text, safe areas, touch/Back navigation.
- [ ] Compare compact versus relaxed density in file rows.
- [ ] Reader: verify swipe does not interfere with vertical scrolling or text selection.
- [ ] Reader: verify focus-mode chrome can always be restored.
- [ ] Player: confirm unavailable playback is clearly distinguished from functioning queue layout.
- [ ] Confirm no personal content is copied into repository or into the build.

This is a **layout comparison**, not an adopted app or an approved shared component library. Dependency versions are pinned to Expo SDK 57 compatibility; after an install succeeds, a lockfile should be committed for reproducibility. No UI or GitHub code from earlier builds was transplanted.