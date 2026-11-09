# Folder Launcher — release signing and updates

The app is installable from a debug build for testing, but Android only accepts an in-place update when the new APK is signed by the same certificate as the installed one. This document defines one stable private release key and the update procedure that preserves the installed app's data.

The release key is **not tracked in this repository**. The setup workspace generated it at `apps/folder-launcher/native/android-app/.signing/folderlauncher-release.jks`, with credentials in the ignored `apps/folder-launcher/native/android-app/keystore.properties`.

- Alias: `folderlauncher`
- Key: RSA 4096-bit, PKCS#12, validity 10,000 days
- Certificate SHA-256: `C9:1A:A7:14:AC:9B:E1:55:03:ED:81:00:4C:F5:C8:35:4A:F7:9B:58:73:65:95:E1:CF:6A:E8:7A:35:18:D7:4A`

That fingerprint is the public release identity. The private key and passwords must be backed up together in encrypted storage or a password manager. A clone of the repository does not contain them.

## One-time setup

From the repository root, with a JDK 17 installation:

```sh
export JAVA_HOME=/path/to/jdk-17
apps/folder-launcher/native/android-app/setup-release-signing.sh
```

The script:

- refuses to overwrite an existing keystore or `keystore.properties`;
- verifies both paths are Git-ignored before writing secrets;
- creates a random password without printing it;
- writes the ignored credentials file;
- prints the certificate fingerprint.

Do not run it a second time to "refresh" the key. Replacing the key changes the app's signing identity. If the key is lost, existing installations cannot receive updates signed by a replacement; users must uninstall and reinstall, losing local app data. If the key is compromised, treat rotation as a migration that requires the same uninstall/reinstall step.

### Credentials format

`keystore.properties` is read from `apps/folder-launcher/native/android-app/` and is intentionally ignored:

```properties
storeFile=.signing/folderlauncher-release.jks
storePassword=...
keyAlias=folderlauncher
keyPassword=...
```

For CI or another machine, the same values can be supplied without a file. `FOLDER_LAUNCHER_KEYSTORE_FILE` must be an absolute path or a path relative to `apps/folder-launcher/native/android-app/`:

```sh
export FOLDER_LAUNCHER_KEYSTORE_FILE=/secure/path/folderlauncher-release.jks
export FOLDER_LAUNCHER_STORE_PASSWORD=...
export FOLDER_LAUNCHER_KEY_ALIAS=folderlauncher
export FOLDER_LAUNCHER_KEY_PASSWORD=...
```

Do not put these values in a tracked file, a command echoed into logs, or a pull request. The Gradle release build fails closed when they are missing; it does not fall back to the debug key or quietly produce an unsigned release.

## Release checklist

1. Confirm the release key and `keystore.properties` are present and backed up.
2. Increase `versionCode` in `apps/folder-launcher/native/android-app/app/build.gradle`. Android requires the new value to be greater than the installed build. Update `versionName` for the user-facing version.
3. Run the source and build checks:

   ```sh
   node --test apps/folder-launcher/tests/test_*.js
   python3 apps/folder-launcher/tests/test_source_contract.py
   export JAVA_HOME=/path/to/jdk-17
   export ANDROID_HOME=/path/to/android-sdk
   export PATH="$JAVA_HOME/bin:$PATH"
   cd apps/folder-launcher/native/android-app
   gradle clean :app:assembleRelease --no-daemon
   ```

4. Verify the signed APK:

   ```sh
   APK=app/build/outputs/apk/release/app-release.apk
   "$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose --print-certs "$APK"
   "$ANDROID_HOME/build-tools/35.0.0/aapt" dump badging "$APK" | grep '^package:'
   sha256sum "$APK"
   ```

   Confirm the certificate SHA-256 is
   `c91aa714ac9be15503ed81004cf5c8354af79b58736595e1cf6ae87a3518d74a`,
   the package is `xyz.chaoticka.folderlauncher`, and the version is the one you intended.

5. For the **first** release-signed install over an existing debug build, uninstall once:

   ```sh
   adb uninstall xyz.chaoticka.folderlauncher
   adb install "$APK"
   ```

   This is required because the debug and release certificates differ. Uninstalling clears the app's local browser storage. For later releases signed by this same key, install in place:

   ```sh
   adb install -r "$APK"
   ```

6. Exercise the installed app: choose the folder, open a loose HTML app and a ZIP app, restart the launcher, and confirm that updating in place preserves the expected local data.
7. Publish only when authorized. Attach the APK and its SHA-256 to the release notes. Do not commit a release APK to this public repository. The checked-in `artifacts/folder-launcher/FolderLauncher.apk` remains the debug-signed testing artifact and is not the release key.

## CI option

The Gradle configuration already accepts the four `FOLDER_LAUNCHER_*` environment variables. If a signed release workflow is added later, the keystore must be supplied through repository secrets, decoded to a temporary path with restricted permissions, and removed after the build. The current `Build Folder Launcher APK` workflow remains debug-only; no release workflow or signing secret is added by this change.

## Verification performed for this setup

- `assembleRelease` succeeded with the generated key and produced a v2-signed APK.
- Both the local `keystore.properties` path and the four environment variables were exercised.
- `apksigner` verified one signer with the certificate fingerprint above.
- `aapt` reported package `xyz.chaoticka.folderlauncher`, versionCode 2 / versionName 0.2.0, minSdk 26, targetSdk 35.
- No device installation or in-place update was performed in this workspace; the first release install and data-preservation behavior still require the checklist above on a device.
