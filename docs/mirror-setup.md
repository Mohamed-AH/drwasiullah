# Mirroring PDFs (and audio) to our own R2 bucket

One-time, on your own computer (needs access to wordpress.com / archive.org):

1. `pip install -r tools/requirements-mirror.txt`
2. Credentials: in Cloudflare → R2 → **Manage R2 API tokens**, the token must be an **S3-compatible** one (it shows an *Access Key ID* and a *Secret Access Key*; the plain "API token" value will not work), scoped to the bucket `drwasiullah-media` with *Object Read & Write*.
   Put these in a `.env` file in the repo root (it is git-ignored) or export them:
   ```
   R2_ACCOUNT_ID=<32-char hex account ID from the R2 overview page - NOT a token>
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   ```
3. `python tools/mirror_media.py --dry-run` (list) → `python tools/mirror_media.py` (PDFs) → `python tools/mirror_media.py --verify` (checks https://media.drwasiullah.com serves each file).
4. Commit `site/data/media.json` and merge. The site then links the R2 copy first and keeps the original as the fallback.
Audio later: `--kind audio --limit 20` to try a few, then without `--limit` (≈ 12.8 GB; mind the storage budget in ROADMAP.md).
