# Backup and redundancy plan (set up 2026-11)

Low-cost, free-tier-first. Target extra cost: about US$0.10/month (Backblaze B2). Everything runs as GitHub Actions; nothing needs a server of ours.
How to restore: `docs/restore-guide.md`. Who to call and where secrets come from: `docs/handover.md`.

## What protects what

| What | Primary copy | Second copy | Third copy | Alarm if it stops |
|---|---|---|---|---|
| Content database | D1 | `backup/` in git, nightly (`d1-backup.yml`), proven restorable (`db.mjs verify`) | **encrypted full dump in B2 `private/d1/`**, nightly (users, audit log, counters, notices too) + D1 Time Travel 7 days | healthchecks.io heartbeat; red run if secrets missing |
| Audio, PDFs, EPUBs | R2 `drwasiullah-media` | **B2 `media/`**, weekly, copy-only, size-checked (`media-backup.yml`) | originals on archive.org for the old files; the owner's folders for new batches (keep until B2 is green) | red run if any R2 file is missing in B2; weekly sweep that every media URL answers with the right size |
| Code, history, Publish commits | GitHub | **GitLab mirror**, nightly (`git-mirror.yml`) | owner's local clones | heartbeat |
| Published site | Cloudflare deployments | rollback (restore-guide D) | the build is reproducible from git | `/health`, health Action |
| Credentials | Cloudflare / GitHub | n/a (re-create; see handover.md) | | weekly expiry watch (14 days ahead) |
| A bad Publish | | publish guard stops a drop of ≥10 lessons that is also >5% | rollback / Time Travel | |

Accepted risk: Cloudflare is one vendor for DNS, hosting, R2, D1 and Access. Automatic multi-vendor failover is not worth its cost; the break-glass plan is in `docs/handover.md`.

## One-time setup (owner). Until each step is done its workflow shows a yellow warning, never a red failure.

### Step 1: Backblaze B2 (media copy + encrypted database copy)
1. Backblaze → B2 Cloud Storage → **Buckets → Create a Bucket** (private, e.g. `drwasiullah-backup`; you can also reuse your existing B2 account, a NEW bucket is cleaner). Turn **Object Lock off**, default encryption on.
2. **Application Keys → Add a New Application Key**: name `drwasiullah-github`, *Allow access to bucket(s)*: that bucket only, **Read and Write**, and, if the form shows capabilities (the "advanced" key form), **do NOT grant `deleteFiles`**. Copy `keyID` and `applicationKey` (shown once).
3. In GitHub → repo → Settings → Secrets and variables → Actions → **Secrets**, add: `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET` (the bucket NAME).
4. R2 read access for the Action: Cloudflare → R2 → **Manage R2 API tokens → Create API token** → *Object Read only*, bucket `drwasiullah-media` (a separate token from the one on your computer; it needs read only). Add secrets `R2_ACCOUNT_ID` (the 32-character account ID), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
5. Choose a long passphrase for the encrypted database copy (a password manager can generate one). Add it as secret `BACKUP_PASSPHRASE` **and store it in your password manager**: without it the encrypted copies cannot be opened, and nobody can reset it.
6. GitHub → Actions → **Media backup (R2 to Backblaze B2)** → Run workflow. The first run copies everything (13 GB, later ~24 GB with Fath al-Bari) and may take one to two hours; it must end green. Then Actions → **D1 backup** → Run workflow: the log should show `uploaded private/d1/d1-YYYY-MM-DD.sql.gz.gpg`.

### Step 2: heartbeats (healthchecks.io, free plan)
Create a free account and 4 checks, each with the schedule and a grace time: *D1 backup* (daily, grace 6 h), *Media backup* (weekly, grace 1 day), *Git mirror* (daily, grace 6 h), *Weekly checks* (weekly, grace 1 day). Put the email (or phone app) alert on each. Copy each check's **ping URL** into the secrets `HC_PING_D1_BACKUP`, `HC_PING_MEDIA_BACKUP`, `HC_PING_GIT_MIRROR`, `HC_PING_WEEKLY`. If a job stops running (token expired, workflow disabled by GitHub after 60 days of repository inactivity, runner problems) you are emailed.

### Step 3: GitLab mirror
1. gitlab.com → New project → **Create blank project**, **private**, name `drwasiullah`, **untick** "Initialize with a README".
2. Project → Settings → **Access tokens** → Add: role **Maintainer**, scope **write_repository**, expiry as long as allowed (note the date). (If the free plan offers no project tokens, use a personal access token with `write_repository`.)
3. GitHub secrets: `GITLAB_TOKEN` (the token) and `GITLAB_PROJECT` (`yourgroup/drwasiullah`, from the project URL). Run Actions → **Git mirror (GitLab)** once; the project then shows the files and history.
4. If the first push of `main` is rejected, GitLab protected the empty branch: Settings → Repository → Branch rules → allow force push is NOT needed; just make sure the project is empty.

### Step 4: expiry watch
Create the repository **variable** (not secret) `GH_TOKEN_EXPIRES` = the expiry date of the portal's GitHub token, `YYYY-MM-DD` (the date you chose when you created the fine-grained token, docs/admin-setup.md). The weekly check emails you 14 days before it, and 14 days before the Cloudflare API token expires (that one it reads itself).
Also note the GitLab token's expiry in your calendar.

### Step 5: Fath al-Bari to R2 (the team agreed)
On your computer (Git Bash), where makkahscholars.org is reachable and the R2 keys are in `.env` (docs/mirror-setup.md):
```
git pull
python tools/mirror_media.py --kind audio --include-makkah --dry-run     # expect about 1,226 files, ~10 GB
python tools/mirror_media.py --kind audio --include-makkah               # resumable: stop with Ctrl+C and run again
python tools/mirror_media.py --verify --new
git add site/data/media.json && git commit -m "Mirror Fath al-Bari to R2" && git pull --rebase && git push
```
The site then plays our copy first and keeps makkahscholars.org as the fallback. The next weekly media backup copies the new files to B2 automatically (run it by hand to hurry).

### Step 6: owner actions with no code (do them this month)
- **Second admin / bus factor** (decide later): add one trusted person in Cloudflare Access (policy) AND in the portal «المستخدمون»; and as a member of the Cloudflare and GitHub accounts, or leave sealed instructions (`docs/handover.md`).
- 2FA with saved recovery codes on Cloudflare, GitHub, Namecheap, Backblaze, GitLab and the email account used for them.
- Namecheap: auto-renew on, registrar lock on, DNSSEC on, card not expiring soon; consider registering for several years.
- Cloudflare: billing notification; export the DNS records once a month (DNS → Records → Export) into your password manager's notes or a private folder.
- Keep the original recording folders (e.g. `wasiullahdrive\downloads`) until the first Media backup run is green.

## Renewing a token
- **Cloudflare API token** (used by the Actions): Cloudflare → My Profile → API Tokens → roll/recreate with the same permissions (D1 **Edit**) → update the GitHub secret `CLOUDFLARE_API_TOKEN`.
- **Portal GitHub token** (Publish): docs/admin-setup.md step 2 → `npx wrangler secret put GH_DISPATCH_TOKEN -c admin/wrangler.jsonc` → update the variable `GH_TOKEN_EXPIRES`.
- **GitLab token**: create a new one, update `GITLAB_TOKEN`.

## Publish guard
Publish now stops (red run, the portal's flash says the request was made, GitHub emails you) when the export would remove ≥10 lessons that are also more than 5% of a file (or ≥3 series / ≥3 books and more than 20%). If it is intended (for example a whole series was hidden on purpose): GitHub → Actions → **Publish from the admin portal** → Run workflow → tick **allow_drop**. If it is not intended: do not publish; check «السجل», fix or restore (restore-guide A/B).

## Monthly (5 minutes)
Actions page: the last runs of D1 backup, Media backup, Git mirror, Weekly checks are green. healthchecks.io shows all four "up". B2 bucket size roughly equals R2's. Once a quarter: a restore drill (restore-guide §F) and open one encrypted copy (restore-guide H).

## Cost
B2 storage ≈ US$0.006 per GB per month beyond the free 10 GB (check current prices): 13 GB ≈ US$0.02, with Fath al-Bari (≈24 GB) ≈ US$0.09. Downloads from R2 are free (no egress fee) and B2 egress is free up to 3× the stored amount. GitLab, healthchecks.io and GitHub Actions on a public repository: free. R2 itself: Fath al-Bari adds about US$0.15/month.
