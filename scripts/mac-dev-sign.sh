#!/bin/sh
# Signs your local macOS build with a stable, self-made certificate.
#
# Why: `tauri build` only gives the app an "ad-hoc" signature, which changes on
# every build. macOS remembers folder permissions (Documents, Desktop…) per
# signature, so it asks again and again. Signed with the same certificate every
# time, the app keeps its permissions: macOS asks once, the first time.
#
#   sh scripts/mac-dev-sign.sh setup   # once: make the "ICEBREAKER Dev" certificate
#   sh scripts/mac-dev-sign.sh allow   # once: let codesign use it without asking your password
#   npm run app:mac                     # build + sign (or: sh scripts/mac-dev-sign.sh)
#
# The certificate stays in your login keychain and only exists on your Mac.
# It is not an Apple Developer ID: an app signed with it is for you, not for sharing.
set -e
NAME="ICEBREAKER Dev"
APP="${APP:-src-tauri/target/release/bundle/macos/ICEBREAKER.app}"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

has_identity() {
  security find-identity -p codesigning "$KEYCHAIN" 2>/dev/null | grep -q "\"$NAME\""
}

# codesign may use the key without the keychain asking for your password each time
# (asks for your Mac password once, here in the terminal)
allow_codesign() {
  echo "Your Mac password (once): it lets codesign use the \"$NAME\" key without asking again."
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -D "$NAME" -t private "$KEYCHAIN" >/dev/null
  echo "✓ codesign can sign with \"$NAME\" without asking"
}

if [ "$1" = "allow" ]; then
  has_identity || { echo "no \"$NAME\" certificate yet: sh scripts/mac-dev-sign.sh setup"; exit 1; }
  allow_codesign
  exit 0
fi

if [ "$1" = "setup" ]; then
  if has_identity; then
    echo "✓ the \"$NAME\" certificate is already in your keychain"
    exit 0
  fi
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  cat > "$tmp/cfg" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF
  # macOS's own openssl (LibreSSL) writes a .p12 the keychain can import
  /usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$tmp/cfg" \
    -keyout "$tmp/key.pem" -out "$tmp/cert.pem" 2>/dev/null
  /usr/bin/openssl pkcs12 -export -inkey "$tmp/key.pem" -in "$tmp/cert.pem" \
    -out "$tmp/id.p12" -passout pass:icebreaker
  security import "$tmp/id.p12" -k "$KEYCHAIN" -P icebreaker -T /usr/bin/codesign >/dev/null
  # check that codesign accepts it; if not, mark it trusted for code signing
  cp /usr/bin/true "$tmp/probe"
  if ! codesign --force --sign "$NAME" "$tmp/probe" 2>/dev/null; then
    echo "macOS will ask for your password to trust the certificate for code signing…"
    security add-trusted-cert -p codeSign -k "$KEYCHAIN" "$tmp/cert.pem"
  fi
  allow_codesign
  echo "✓ \"$NAME\" created. Now build with: npm run app:mac"
  exit 0
fi

if ! has_identity; then
  echo "⚠ no \"$NAME\" certificate: the app keeps its ad-hoc signature,"
  echo "  so macOS will keep asking for folder access. Run once:"
  echo "    sh scripts/mac-dev-sign.sh setup"
  exit 0
fi
[ -d "$APP" ] || { echo "no app at $APP (build it first)"; exit 1; }
codesign --force --deep --sign "$NAME" --identifier org.icebreaker.deck "$APP"
echo "✓ signed $APP with \"$NAME\""
