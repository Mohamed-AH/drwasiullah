#!/usr/bin/env bash
# gzip + AES-256 encrypt a file with a passphrase, then prove the result decrypts and unzips to the same bytes.
#   scripts/encrypt_backup.sh <input> <output.gz.gpg>     passphrase in the environment variable BACKUP_PASSPHRASE (never on a command line)
set -euo pipefail
IN="${1:?input file}"; OUT="${2:?output file}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
umask 077
PF="$(mktemp)"; trap 'rm -f "$PF"' EXIT
printf '%s' "$BACKUP_PASSPHRASE" > "$PF"
gzip -9 -c "$IN" | gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 --passphrase-file "$PF" -o "$OUT"
# round trip: must give back exactly the input
gpg --batch --quiet --pinentry-mode loopback --decrypt --passphrase-file "$PF" "$OUT" | gunzip | cmp - "$IN"
echo "encrypted $(wc -c < "$IN") bytes -> $(wc -c < "$OUT") bytes, round trip ok"
