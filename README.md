# Pretend Internet

Small, independent, self-explaining mini-apps; no mandatory shared runtime.

**State:** Development standards and template are drafts. No installed WebToApp APK is verified from this repository.

- [Development standards](DEVELOPMENT.md)
- [Roadmap](ROADMAP.md)
- [Library standards review](docs/existing-standards-review.md)
- [Coding-agent rules](AGENTS.md)
- [Runnable mini-app template](templates/mini-app/)

## Build from the GitHub repository root (WebToApp Frontend)

The root has a real static entry (`index.html`) and `package.json`. The build script copies the launcher and its existing Pocket Counter example into `dist/`.

**Important WebToApp compatibility:** Its on-device npm environment can run a build script while `node` is not exposed as a shell command. The current build therefore uses **POSIX `sh`, `mkdir`, and `cp` only**. It does not call `node` and downloads no JavaScript build dependencies.

In WebToApp → **Frontend → Import from GitHub**:

1. Enter `https://github.com/br3avery-maker/Pretend-Internet`.
2. Branch: `main`. **Sub-path: blank** to build the full repository launcher.
3. Tap **Fetch & Analyze** again to refresh the local copy (remove/reselect an older downloaded workspace if necessary).
4. Run the `build` script; WebToApp should use `npm run build` and package output directory **`dist`**.
5. Test WebToApp's preview **and** the exported, installed APK. Report the actual device result before setting any app to `live`.

WebToApp may label this minimal static project **Framework: Unknown**. That alone is not an error: there is no React/Vue/Vite framework. If you'd rather skip npm entirely, choose its **HTML** app type and import the static files instead; HTML is the intended type for unbuilt static websites.

**This is a small development launcher, not the finished Pretend Internet or the 16 apps previously packed in Br3Apps.** Only one explicitly WIP example is included. No private services, keys, or Library sources are bundled.

To validate on a regular computer with npm: `npm ci && npm run build && npm run check`. To run without any `node` command: `sh scripts/build-frontend.sh && sh scripts/check-frontend.sh`.

Open `templates/mini-app/index.html` directly for the standalone example. No backend or network is needed.

To make a new app, copy the template into `apps/<app-id>/`, replace its actual functionality, identity and visible Help, and validate metadata with `python3 scripts/validate-mini-app.py apps/<app-id>`. This only checks metadata and file paths, not runtime or APK operation.

Nothing in this repository automatically imports, archives, or deletes ChatGPT Library files.
