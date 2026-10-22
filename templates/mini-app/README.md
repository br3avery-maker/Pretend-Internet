# Pocket Counter — runnable mini-app template

Open `index.html` in any modern browser. No build tool, package manager, network, backend, account or API key is required.

**Real example functions:** count up/down, reset, switch between Punk and Daylight skins, open Help, save count and selected skin when local storage is available.

**Try:** click +1 twice, switch skin, reload, confirm count is 2 and skin persists. Test Reset, Help, keyboard focus, phone-width layout, and no network. Storage may be unavailable in some hosts; the app still works in memory and labels the limitation.

## Start a real app

1. Copy this directory into `apps/<app-id>/` and rename IDs, page title, manifest and docs.
2. Replace example features with **actually implemented** features; update visible Help to describe what works, limitations, and data.
3. Customize semantic colors/spacing in `skin.css`; do not move business logic into skin rules.
4. Run `python3 scripts/validate-mini-app.py apps/<app-id>` from repository root.
5. Test the real behavior. If targeting WebToApp, follow its supported import, export the APK, install and exercise the APK on-device before labeling it `live`.

`app.json` is a **proposed Pretend Internet metadata file**, not a WebToApp-native format. It is not automatically loaded by this demo; keep its descriptions consistent with visible Help.

**Status:** browser example / WIP, not an Android-tested release.
