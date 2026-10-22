# Pretend Internet

Small, independent, self-explaining mini-apps; no mandatory shared runtime.

**State:** Development standards and template are drafts. No installed WebToApp APK is verified from this repository.

- [Development standards](DEVELOPMENT.md)
- [Roadmap](ROADMAP.md)
- [Library standards review](docs/existing-standards-review.md)
- [Coding-agent rules](AGENTS.md)
- [Runnable mini-app template](templates/mini-app/)

Run the template by opening `templates/mini-app/index.html` in a browser. No dependencies or backend.

Copy that folder to `apps/<app-id>/` for a new app. Change the behavior, identity, visible Help, manifest and README. Validate the manifest using `python3 scripts/validate-mini-app.py apps/<app-id>`. Validation does **not** prove runtime, WebToApp import, or installed APK operation.

The project does not automatically import, archive or delete anything from the ChatGPT Library.
