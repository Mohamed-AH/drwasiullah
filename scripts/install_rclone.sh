#!/usr/bin/env bash
# Installs a pinned rclone for the backup workflows (GitHub-hosted Linux runners). The download is checked against the published SHA256SUMS.
set -euo pipefail
V="${RCLONE_VERSION:-v1.68.2}"
T="$(mktemp -d)"
curl -fsSL "https://downloads.rclone.org/$V/rclone-$V-linux-amd64.zip" -o "$T/rclone.zip"
curl -fsSL "https://downloads.rclone.org/$V/SHA256SUMS" -o "$T/SHA256SUMS"
( cd "$T" && grep " rclone-$V-linux-amd64.zip\$" SHA256SUMS | sed 's/^\(.*\)  \(.*\)$/\1  rclone.zip/' | sha256sum -c - )
unzip -q -o "$T/rclone.zip" -d "$T"
sudo install -m 0755 "$T"/rclone-"$V"-linux-amd64/rclone /usr/local/bin/rclone
rclone version | head -1
