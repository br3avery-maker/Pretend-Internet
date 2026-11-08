Folder Launcher v0.2.0 — Web2App HTML input

Select index.html as the HTML entry point in your preferred Web2App builder. A ZIP of these files has index.html at the ZIP root.

THIS IS THE HTML-ONLY FALLBACK, not the Android native directory bridge. It allows importing HTML and ZIP files and saving copies to IndexedDB. Direct persistent Android folder scanning may not work because Web2App WebViews differ.

No Web2App UI permission setting can add the Android SAF directory bridge when the converter doesn't provide one. For zero-reimport, automatic drop-file scanning, use the supplied Android source project instead: it has the manifest and persisted folder permission wired already.

No permissions are needed to play basic packaged HTML content. An HTML-to-APK builder must itself implement the file chooser to make imports work. Offline ZIP preview supports simple relative resources; native Android version is recommended for complex ZIP sites.
