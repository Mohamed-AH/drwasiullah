# Sourced by the backup scripts: defines the rclone remotes from environment variables (nothing is written to disk, nothing is printed).
#   r2:  our media bucket (S3-compatible API)          needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
#   b2:  the Backblaze B2 backup bucket                 needs B2_KEY_ID, B2_APPLICATION_KEY
# For tests, RCLONE_TEST_LOCAL=1 skips the credentials (the scripts then use whatever remotes the caller has already defined).
if [ -z "${RCLONE_TEST_LOCAL:-}" ]; then
  : "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is not set}" "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is not set}" "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is not set}"
  : "${B2_KEY_ID:?B2_KEY_ID is not set}" "${B2_APPLICATION_KEY:?B2_APPLICATION_KEY is not set}" "${B2_BUCKET:?B2_BUCKET is not set}"
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
         RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
         RCLONE_CONFIG_R2_REGION=auto RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  export RCLONE_CONFIG_B2_TYPE=b2 RCLONE_CONFIG_B2_ACCOUNT="$B2_KEY_ID" RCLONE_CONFIG_B2_KEY="$B2_APPLICATION_KEY" RCLONE_B2_NO_CHECK_BUCKET=true
fi
