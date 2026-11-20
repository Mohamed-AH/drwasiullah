#!/usr/bin/env bash
# Second copy of every media file: R2 bucket (drwasiullah-media) -> Backblaze B2 (<bucket>/media/).
#
#   COPY ONLY, never sync: nothing is ever deleted or overwritten at the destination (keys are content hashes, so a key never changes
#   meaning). A file deleted from R2 by mistake therefore stays safe in B2. Re-running is cheap: files already there are skipped without
#   being read (--ignore-existing); the first run copies everything (~13 GB + Fath al-Bari when it is mirrored).
#   Then it checks that every R2 file exists in B2 with the same size; a missing file makes the script (and the Action) fail.
#
#   Environment: see rclone_env.sh. Optional: SRC (default r2:drwasiullah-media), DST (default b2:$B2_BUCKET/media), TRANSFERS (default 4).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/rclone_env.sh"
SRC="${SRC:-r2:drwasiullah-media}"
DST="${DST:-b2:${B2_BUCKET:-}/media}"
echo "copy $SRC -> $DST (copy only, existing files skipped)"
rclone copy "$SRC" "$DST" --ignore-existing --transfers "${TRANSFERS:-4}" --checkers 16 --retries 5 --low-level-retries 10 --stats 60s --stats-one-line -v
echo "check: every file of $SRC must exist in $DST with the same size"
MISSING="$(mktemp)"
if ! rclone check "$SRC" "$DST" --one-way --size-only --missing-on-dst "$MISSING" >/dev/null 2>"$MISSING.err"; then
  echo "BACKUP INCOMPLETE: $(wc -l < "$MISSING") file(s) are missing or differ in B2:" >&2
  head -20 "$MISSING" >&2; head -5 "$MISSING.err" >&2
  exit 1
fi
echo "ok: $(rclone lsf "$SRC" --files-only -R | wc -l) file(s) in $SRC, all present in $DST"
