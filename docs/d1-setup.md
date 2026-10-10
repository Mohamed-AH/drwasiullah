# Content database (Cloudflare D1) — setup and tools

Phase 1 of [admin-portal-spec.md](admin-portal-spec.md). **Nothing about the live site changes in this phase**: the site is still built from the JSON files in git. D1 is filled from them, proven to reproduce them byte for byte, and backed up nightly.

## What is in the repo
| File | Purpose |
|---|---|
| `db/migrations/0001_init.sql` | the tables (`series`, `lessons`, `books`, `media`, `docs`, `files`, plus empty `users` and `audit_log` for phase 2) |
| `scripts/db.mjs` | `seed` (JSON → SQL), `export` (database → JSON), `verify` (round trip, compares bytes). Node only, no installs |
| `.github/workflows/d1-backup.yml` | nightly export of D1 to `backup/` (does nothing until the two secrets below exist) |

Every row keeps its original JSON object next to a few real columns (`id`, `series_id`, `n`, `status`…), so nothing is lost and the export equals the source files exactly. Rows have `status` = `published` / `draft` / `hidden`; the export for the build ships only `published`, the backup (`--all`) keeps everything.

## Check it any time (no Cloudflare needed)
```
node --no-warnings scripts/db.mjs verify
```
Expected: `parity ok`, `series 29, lessons 3298, books 24`. Run it after any change to the data files or the script.

## Owner steps (once)
1. **Create the database** (Git Bash, in the repo folder; `npx wrangler login` first if asked):
   ```
   npx wrangler d1 create drwasiullah
   ```
   Copy the `database_id` it prints and send it to Claude (it is not a secret) — it goes into `wrangler.jsonc` as the `DB` binding.
2. **Create the tables and fill them:**
   ```
   npx wrangler d1 migrations apply drwasiullah --remote
   node --no-warnings scripts/db.mjs seed
   npx wrangler d1 execute drwasiullah --remote --file db/seed.sql
   ```
   `db/seed.sql` is generated and git-ignored. It clears the content tables first, so it is safe to run again (it costs about 15k of the 100k free row-writes per day; do not repeat it dozens of times a day).
3. **Check:** `npx wrangler d1 execute drwasiullah --remote --command "select (select count(*) from lessons) l, (select count(*) from series) s, (select count(*) from books) b"` → `3298, 29, 24`.
4. **Backup secrets** (GitHub → Settings → Secrets and variables → Actions → New repository secret):
   - `CLOUDFLARE_ACCOUNT_ID` — Cloudflare dashboard → Workers & Pages → right side "Account ID".
   - `CLOUDFLARE_API_TOKEN` — My Profile → API Tokens → Create Token → custom, permission **Account · D1 · Read** (that is enough for an export), this account only.
   Then Actions → "D1 backup" → Run workflow once and check that `backup/` appears.

## Who owns which file (important until phase 4)
Until the admin portal takes over, **git stays the source of truth** and D1 is a copy. `catalogue.json` is written by the daily YouTube sync, so it must not be replaced from D1 before phase 4. The cut-over per file happens in the phase that moves its editing into the portal (audio library and media in phase 3, catalogue in phase 4, schedule/banners in phase 5). Re-seed D1 from git if you change a JSON file by hand before then.

## Privacy
The repository is public. Only site content is ever exported to git. `users` (editors' emails) and `audit_log` are excluded from every export on purpose.
