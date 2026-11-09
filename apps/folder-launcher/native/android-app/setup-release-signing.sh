#!/usr/bin/env bash
# Create the stable, private Android signing key for Folder Launcher.
# The key and credentials stay in ignored files; never commit them.
set -euo pipefail

APP_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$APP_DIR" rev-parse --show-toplevel)"
SIGNING_DIR="$APP_DIR/.signing"
KEYSTORE="$SIGNING_DIR/folderlauncher-release.jks"
PROPERTIES="$APP_DIR/keystore.properties"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[[ -d "$REPO_ROOT" ]] || die "not inside a git checkout"
if [[ -e "$KEYSTORE" || -e "$PROPERTIES" ]]; then
  die "signing material already exists; refusing to replace a stable key. Move it aside only if you intentionally want a new identity."
fi

for path in "$KEYSTORE" "$PROPERTIES"; do
  rel="${path#"$REPO_ROOT"/}"
  git -C "$REPO_ROOT" check-ignore -q -- "$rel" ||
    die "$rel is not ignored; add the signing paths to .gitignore before creating secrets"
done

KEYTOOL=""
if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/keytool" ]]; then
  KEYTOOL="$JAVA_HOME/bin/keytool"
elif command -v keytool >/dev/null 2>&1; then
  KEYTOOL="$(command -v keytool)"
fi
[[ -n "$KEYTOOL" ]] || die "keytool not found; set JAVA_HOME to a JDK 17 installation"
command -v openssl >/dev/null 2>&1 || die "openssl is required to generate a random password"

umask 077
mkdir -p "$SIGNING_DIR"

PASSWORD="$(openssl rand -base64 32 | tr -d '\n')"
[[ -n "$PASSWORD" ]] || die "password generation failed"

cleanup_on_error() {
  rm -f "$KEYSTORE" "$PROPERTIES"
}
trap cleanup_on_error ERR

"$KEYTOOL" -genkeypair \
  -keystore "$KEYSTORE" \
  -storetype PKCS12 \
  -storepass "$PASSWORD" \
  -keypass "$PASSWORD" \
  -alias folderlauncher \
  -keyalg RSA \
  -keysize 4096 \
  -sigalg SHA256withRSA \
  -validity 10000 \
  -dname "CN=Folder Launcher Release, OU=Mobile, O=Pretend Internet, C=US" \
  -noprompt

cat > "$PROPERTIES" <<EOF
storeFile=.signing/folderlauncher-release.jks
storePassword=$PASSWORD
keyAlias=folderlauncher
keyPassword=$PASSWORD
EOF

chmod 600 "$KEYSTORE" "$PROPERTIES"
chmod 700 "$SIGNING_DIR"

FINGERPRINT="$("$KEYTOOL" -J-Duser.language=en -list -v -keystore "$KEYSTORE" -storepass "$PASSWORD" -alias folderlauncher |
  sed -n 's/.*SHA256: //p' | head -1)"
if [[ -z "$FINGERPRINT" ]]; then
  cleanup_on_error
  die "could not read the generated certificate fingerprint"
fi

trap - ERR
unset PASSWORD

printf 'Created release signing identity.\n'
printf '  keystore:    %s\n' "$KEYSTORE"
printf '  properties:  %s\n' "$PROPERTIES"
printf '  alias:       folderlauncher\n'
printf '  certificate SHA-256: %s\n' "$FINGERPRINT"
printf '\nBoth files are git-ignored and must not be committed.\n'
printf 'Back them up together in encrypted storage or a password manager before distributing any build.\n'
printf 'Losing or replacing this key prevents updates from installing over an existing install.\n'
