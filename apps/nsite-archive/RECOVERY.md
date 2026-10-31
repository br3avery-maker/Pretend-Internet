# Recovery and ownership

The browser port was absent from all six current Pretend-Internet branches inspected at repair start (main `d4b4760dd53ac4cc8a61bd3a96260a9d179ccb16`). Its executable assets were present in the user-supplied `app-debug.apk`. `recovery.json` records the exact APK and asset SHA-256 hashes. No claim is made to have recovered the original pre-bundle source or source maps.

`vendor/archive-engine.js` retains the original main bundle up to (but excluding) its UI/service-worker registration, adds named exports for existing functions, and preserves bundled license notices. `vendor/collector-engine.js` retains the collection bundle up to its old worker message handler, exports its existing functions, and preserves bundled notices. Signature, native-hash, chunk/Merkle and archive-format code is reused, not reimplemented. Fixtures use a deterministic public test key, never a user identity.

The former UI rebuilt all legacy trees and repeatedly scanned arrays for each redraw; selecting a site also initiated up to 100,000 pair comparisons. The new catalog materializes only latest trees for lists; selected histories are reconstructed on demand. Hash/page/job/settings indexes replace repeated scans. Related-content comparisons are limited to the selected publication and capped output. Only 40 result rows render initially. Expensive imports, indexing, backup, comparison, ZIP work and collection run in workers. The collection supervisor no longer reconstructs every historical tree at run completion.

The engines contain bundled Buffer (MIT), ieee754 (BSD-3-Clause), noble hashes/curves/ciphers (MIT), scure base (MIT), parse5 (MIT), fflate (MIT) and idb (ISC) implementations from the supplied APK; exact bundled package versions were not recoverable. Embedded copyright/license comments are preserved. No external dependency is downloaded by this app. The repository source and the APK remain the provenance for application-specific work; this recovery does not assert a new blanket upstream license.

An original Android signing key was not provided. This repair does not replace or re-sign the supplied APK, claim update compatibility, or remove user data.

Review correction: the restored-file map and the bundled fflate ZIP flattening dictionary use null prototypes, and ZIP traversal only visits own properties. This narrow vendor correction preserves accepted filenames such as `__proto__`, `constructor` and Unicode names; its regression decodes every central-directory entry and compares decompressed bytes.
