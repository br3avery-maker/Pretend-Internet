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