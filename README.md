# Pretend Internet

Small, independent, self-explaining mini-apps; no mandatory shared runtime.

**State:** Development standards and template are drafts. No installed WebToApp APK is verified from this repository.

- [Development standards](DEVELOPMENT.md)
- [Roadmap](ROADMAP.md)
- [Library standards review](docs/existing-standards-review.md)
- [Coding-agent rules](AGENTS.md)
- [Runnable mini-app template](templates/mini-app/)

## Build from the GitHub repository root (WebToApp Frontend)

This repository now includes a **real static frontend entry** (`index.html`) and a dependency-free `npm run build` command that produces `dist/index.html`, with the existing Pocket Counter example included.

In WebToApp → **Frontend → Import from GitHub**:

1. Enter `https://github.com/br3avery-maker/Pretend-Internet`.
2. Use branch `main`; leave **Sub-path** empty to import the new root frontend.
3. Tap **Fetch & Analyze** again so the updated repository is downloaded.
4. Let WebToApp install Node/npm if requested, run `npm run build`, and use output directory **dist**.
5. Verify in its preview and **again inside the installed exported APK** before calling it live.

For the original standalone HTML template, WebToApp's **HTML** app type is a simpler alternative. That example is in `templates/mini-app/`.

**This is a small development launcher, not the finished Pretend Internet or the 16 apps previously packed with WebToApp.** The frontend output currently contains one labeled WIP example. No private services, secrets, or Library sources are bundled.

Local build check: `npm ci && npm run build && npm run check` (Node 18+).

Run the template by opening `templates/mini-app/index.html` in a browser. No dependencies or backend.

Copy that folder to `apps/<app-id>/` for a new app. Change the behavior, identity, visible Help, manifest and README. Validate the manifest using `python3 scripts/validate-mini-app.py apps/<app-id>`. Validation does **not** prove runtime, WebToApp import, or installed APK operation.

The project does not automatically import, archive or delete anything from the ChatGPT Library.
