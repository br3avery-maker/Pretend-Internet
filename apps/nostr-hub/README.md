# Pretend Internet Nostr app

This Android-first web app brings independent sites, games, music and writing into one navigable place. Its source lives here as one companion app in the Pretend Internet portfolio. The existing folder launcher and historical archive keep their independent entry points.

## Experience

- Home and one profile menu link the app's pages. The account picker supports saved public profiles and a separate, explicit signer connection.
- Discover reads bounded signed event metadata. It groups an addressable site by publisher and identifier, with search, saved items and publisher hiding. Opening a published site is an explicit navigation.
- Arcade opens games at their published destinations. Music has a real audio player. The bookshelf opens long-form writing, bundled Loopy Library books and imported Markdown.
- The reader has a chapter drawer, a full-screen reading mode, vertical scroll, horizontal chapter swipe, text settings and persistent bookmarks/position. Library curation supports collections and local metadata.
- Publish stages a draft, presents the account and destinations for review, and distinguishes acceptance from independent relay readback. The application uses an external signer. Browsing and locally stored content do not require one.
- Network uses the existing relay-router transport and separate Blossom preferences. Diagnostics live on their own screen.

## Source and publication

The implementation has a distinct document for each major page plus shared browser modules and styles. The published Loopy Library v3 release is the source for its selected book catalog and covers. This repository does not bundle the release ZIP or SDK download. Public Nostr data is fetched when requested and local settings stay on the device.

Repository commits preserve engineering work. Running this app locally and testing with a disposable signer/relay are separate from releasing a site or publishing as someone else's Nostr identity.

## Build and run

Use Node 22.12 or later from the repository checkout.

```sh
npm ci --prefix apps/nostr-hub
npm run build --prefix apps/nostr-hub
npm run preview --prefix apps/nostr-hub
```

The production output is `apps/nostr-hub/dist/`. Serve that entire directory over HTTPS or localhost so the service worker can cache the app, bundled books, and covers. The package can be served under a subpath. Public relay connections and media may require the network. This build target is a browser/PWA. Installing and testing an Android wrapper is a separate verification target.

In Profiles, enter a public key to save that identity locally, then refresh Discover, Writing, Arcade, or Music. Select the profile to filter those requests. The standalone published game opens when you press Play. Browser reading state belongs to the app, while a launched game manages its own state. The bundled Loopy titles work without any account.

## Verification

```sh
npm test --prefix apps/nostr-hub
npx --prefix apps/nostr-hub playwright install chromium --only-shell
node apps/nostr-hub/test/browser.mjs
```

The browser suite serves the built app over loopback and exercises simulated public endpoints with cryptographically signed relay fixtures and a disposable signer. An optional `CHROMIUM_PATH` can point to a system Chromium. Android Amber and live publication require independent evidence.

## Selected source credits

- The Loopy Library v3 source release by Puter provides the story text and both covers. The published, signature-verified manifest was checked against all 71 release files. This app carries the two covers unchanged and converts the published browser catalog into readable JSON with local asset paths. [Public release source](https://github.com/br3avery-maker/Puters_SwarmMemo/tree/main/storybook/loopy-library-v3)
- Relay request validation and transport come from [Pretend Internet’s relay router](../../tools/relay-router/). The browser build brings in its dependencies through the app’s pinned package versions.
- Third-party dependencies and licensing are retained in the package lock and the production bundle’s dependency licenses where applicable. No private chat excerpts or credential data are packaged.

## Verified behavior

| Check | Result |
| --- | --- |
| Production build and app metadata | Fourteen routable HTML documents with shared modules, service worker, both books, and both cover assets. Existing root frontend verification also passed. |
| Mobile Chromium | Signed profile loading and switching, connection diagnostics, metadata-only discovery, publisher hiding, arcade handoff, actual audio playback through a test media endpoint, writing, cover loading, swipe/bookmarks, offline reading-position restore, and Markdown import and curation. |
| Publishing | A disposable signer authorized a file upload, the app checked bytes after retrieval, then signed a manifest and verified it through a separate relay query. Review produced no upload or relay write. Unit tests also check retry and readback failure. |
| Public source checks | Ditto returned signature-verified user and Puter events. Two declared track URLs responded as MPEG audio. The published 2048 Link game HTML ran a scoring move in an isolated browser with external requests blocked, and its score survived reload. |
| Remaining device evidence | Android installation, Amber handoff on a phone, and real public publish delivery have yet to be exercised for this build. |

For the configured Android-builder package, see [WebToApp import](webtoapp/README.md).
