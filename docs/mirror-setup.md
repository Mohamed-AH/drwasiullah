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

## Saving audio from the lesson page (CORS)

«تحميل» on an audio lesson fetches the file and saves it under a readable name without leaving the page. That needs the host to allow it. For our own bucket: Cloudflare dashboard → R2 → `drwasiullah-media` → Settings → CORS policy → add:

```json
[{ "AllowedOrigins": ["https://drwasiullah.com"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400 }]
```

Without it the button falls back to the plain link (the file opens or saves in the same tab, named by its hash). Files larger than 150 MB always use the plain link. Other hosts (archive.org, makkahscholars.org) save in place only if they send CORS headers; test from the console on the live site: `fetch(url).then(r => r.status)`.

