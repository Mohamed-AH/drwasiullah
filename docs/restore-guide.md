# Backup and restore guide

Step by step, for the owner. Read §1 first, then jump to the procedure that matches what happened. All commands are for **Git Bash in the repository folder** after `git pull`, logged in to Cloudflare (`npx wrangler login`). Nothing here deletes the public site: visitors keep seeing the last published version while you work.

## 0. What is backed up, and where

| What | Where it is kept | How far back | Restore with |
|---|---|---|---|
| **Everything in the database** (lessons, series, books, order, patches, schedule, home layout, **users, audit log, counters, banners, announcements, notices**) | D1 **Time Travel** (Cloudflare keeps a continuous history) | **7 days** on the free plan (30 on paid; the wrangler help text says 30) | Procedure **A** |
| **Content** (lessons, series, books, patches, order, schedule, home layout, bio, media manifest — **all statuses, drafts and hidden included**) | `backup/` in this repository, committed every night at 02:37 UTC by the «D1 backup» Action (only when something changed) | **Forever** (git history) | Procedure **B** |
| **Published content** | `site/data/*.json` in git (written by every Publish) | Forever | Procedure **B** (second source), **D** |
| **The live site** | Cloudflare deployments (every deploy is kept) | Many versions | Procedure **D** |
| **Audio / PDFs / EPUBs** | R2 bucket `drwasiullah-media` (content-addressed files, never changed by the portal) | not backed up — originals are on archive.org / makkahscholars.org / the team's files; `site/data/media.json` maps original → our copy | re-run `tools/mirror_media.py` (see mirror-setup.md) |

**NOT in the git backup (only Time Travel covers them, 7 days):** users, audit log, usage counters, banners, announcements, «no lesson tonight» notices. **Not backed up anywhere in code:** the Access policy (who may log in), GitHub/Cloudflare secrets and tokens. Keep a private note of the team's emails and re-create secrets from their own setup steps (admin-setup.md).

## 1. First, what happened? (decision table)

| Situation | Do this |
|---|---|
| Someone made a **wrong edit** to one title/date/order/etc. | **C** — undo that one edit by hand (no restore needed) |
| Many wrong changes in the portal **in the last 7 days** (bulk mistake, wrong layout, wrong hides…) | **A** — Time Travel to just before the mistake |
| The **public site shows something wrong right now** and you need it fixed in a minute | **D** — roll the site back first, then fix the cause |
| The database was **damaged, deleted, or the mistake is older than 7 days** | **B** — rebuild from `backup/` |
| A **file** (audio/PDF) is missing at media.drwasiullah.com | mirror-setup.md (R2 is separate from the database) |
| Lost **access** (no admin can log in) | add an admin by command (admin-manual.md §7) |

**Always, before restoring:** (1) tell every editor to **stop editing and not to press «النشر»** until you say so — a Publish would copy the bad state to the public site; (2) write down the **time of the mistake** (Time Travel uses **UTC**: Makkah time minus 3 hours); (3) if you can, note anything saved *after* that time that you will want to re-enter.

---

## A. Undo the last days with Time Travel (restores the whole database)

Use when the mistake is recent (≤ 7 days). It rewinds **everything** in the database to a chosen minute — including users, banners and counters — so anything saved after that minute is lost (the audit log is rewound too).

1. **See where you are** and note the current bookmark (this is your way back):
   ```
   npx wrangler d1 time-travel info drwasiullah
   ```
2. **Pick the moment** just *before* the mistake, in UTC (RFC 3339), for example the mistake happened at 14:20 Makkah = 11:20 UTC, so choose 11:15:
   ```
   npx wrangler d1 time-travel info drwasiullah --timestamp 2026-10-14T11:15:00Z
   ```
   It prints the bookmark for that minute. (If you are unsure, restore a few minutes earlier; you can repeat.)
3. **Restore:**
   ```
   npx wrangler d1 time-travel restore drwasiullah --timestamp 2026-10-14T11:15:00Z
   ```
   Confirm when asked. It prints a **previous bookmark** — copy it somewhere: it undoes this very restore.
4. **Check:** open the portal (admin.drwasiullah.com), look at what was wrong (the series, the order page, the home layout…), and check the counts:
   ```
   npx wrangler d1 execute drwasiullah --remote --command "select (select count(*) from lessons) l, (select count(*) from series) s, (select count(*) from books) b, (select count(*) from users) u"
   ```
5. **Not right?** go back to where you were, or try another time:
   ```
   npx wrangler d1 time-travel restore drwasiullah --bookmark <the-previous-bookmark>
   ```
6. **Make the public site match:** if a Publish happened after the mistake, the site still shows the bad state. In the portal press **«النشر» → «نشر الآن»** (it exports the restored database again), wait ~2 minutes, check the site. (If you need the site fixed immediately, do **D** first.)
7. Tell the editors what time the database was rewound to, so they redo anything saved after it. Then they may edit again.

## B. Rebuild the content from the git backup

Use when Time Travel can't help: the mistake is older than 7 days, the data is corrupt, or the database was deleted. It restores **content** (all statuses). It does **not** restore users (re-add them), banners/announcements/notices (re-type them) or counters (lost).

1. **Get the files and pick a version.** Latest backup:
   ```
   git pull
   ```
   An older one: find the nightly commit (`D1 backup YYYY-MM-DD`) and bring just that folder back, **without committing it**:
   ```
   git log --oneline -- backup | head -30
   git checkout <commit-id> -- backup
   ```
   (Afterwards, undo that with `git checkout HEAD -- backup`.) Published-only copy of an older state also exists in `site/data/` history, but the backup is better because it includes drafts and hidden items.
2. **Check the backup is intact** (works offline, takes seconds):
   ```
   node --no-warnings scripts/db.mjs verify --site backup
   ```
   It must end with `parity ok: the database reproduces every data file byte for byte` and prints row counts (for example `series 31, lessons 3300, books 24`). If it does not, pick another day's backup (step 1).
3. **Only if the database itself was deleted** — create it again:
   ```
   npx wrangler d1 create drwasiullah
   ```
   Copy the new `database_id` into **both** `wrangler.jsonc` and `admin/wrangler.jsonc` (`DB` binding), then create the tables and the first admin:
   ```
   npx wrangler d1 migrations apply drwasiullah --remote
   npx wrangler d1 execute drwasiullah --remote --command "insert into users (email, role, name) values ('YOUR@EMAIL','admin','Your name')"
   ```
   Commit the `wrangler.jsonc` change (it is not a secret), then redeploy both Workers (step 8).
4. **Generate the restore SQL** from the backup folder (writes `db/seed.sql`, which git ignores):
   ```
   node --no-warnings scripts/db.mjs seed --site backup
   ```
5. **Load it** into the live database. ⚠️ This **replaces** all lessons, series, books, patches, order, schedule, home layout and bio with the backup's version, so everything saved after the backup is overwritten (users, audit log and counters are left alone):
   ```
   npx wrangler d1 execute drwasiullah --remote --file db/seed.sql
   ```
   It writes about 15,000 rows (the free limit is 100,000 a day), so do it once, not repeatedly.
6. **Check the counts** against step 2:
   ```
   npx wrangler d1 execute drwasiullah --remote --command "select (select count(*) from lessons) l, (select count(*) from series) s, (select count(*) from books) b"
   ```
7. **Re-enter what the backup does not hold:** banners, announcements and «no lesson tonight» notices (portal pages «البانرات», «الإعلانات», «الجدول»); any users added since (portal «المستخدمون»).
8. **Redeploy and publish:** `npx wrangler deploy -c admin/wrangler.jsonc` (needed if the database was re-created); then press **«النشر»** in the portal and check the public site after ~2 minutes. The YouTube catalogue part is refreshed by the next daily sync (or run «YouTube sync» in GitHub Actions).

## C. Undo one specific edit by hand

1. Portal → **«السجل»** (audit log). Find the entry (who, when, what). It shows the **before** and **after** values.
2. Re-enter the *before* value: open the lesson/series/book and save it (or, for a YouTube item, press **«التراجع عن تعديلاتي»** to drop all your patches on it; for order, **«العودة إلى الترتيب التلقائي»**).
3. Press **«النشر»**.
For an item that was only **hidden by mistake**: set its status back to «منشور». The portal never deletes lessons or series, only hides them, so nothing is lost this way.

## D. The live site shows something wrong right now

1. **Roll the site back (about a minute, safe):** Cloudflare dashboard → **Workers & Pages → drwasiullah → Deployments** (or *Versions*) → pick the last good version → **Rollback**. This changes only what visitors see; it does not touch git or the database.
2. **Stop the cause from coming back:** until the database is fixed, **nobody presses «النشر»** — the next Publish or deploy would bring the bad state back. Fix the data with **C** (one edit), **A** (recent mass mistake) or **B** (older/damaged).
3. Press **«النشر»** once the data is right. The new deploy replaces the rolled-back version.
(Alternative for the technical: `git revert <the "Publish from the admin portal" commit>` and push; but the database still holds the bad data, so fix it too or the next Publish re-applies it.)

---

## E. After any restore — checklist
- [ ] Portal opens; the series/lesson/order/home page you cared about looks right
- [ ] Counts look right (the query in A4)
- [ ] Banners/announcements/users re-entered if you used **B**
- [ ] «النشر» pressed, the Action «Publish from the admin portal» is green (GitHub → Actions), the public site shows the right thing
- [ ] `https://drwasiullah.com/health` says ok
- [ ] Editors told what time the data was rewound to
- [ ] The next night, the «D1 backup» Action is green and `backup/` has a new commit

## F. Keep the backup healthy (5 minutes a month)
1. GitHub → Actions → **«D1 backup»**: the last run is green and recent; `backup/` shows a recent commit (`D1 backup YYYY-MM-DD`). If it fails, the usual cause is the Cloudflare token (needs permission **D1 Edit**) or its expiry — renew it (d1-setup.md).
2. Run `node --no-warnings scripts/db.mjs verify --site backup` after a `git pull`: `parity ok` means the backup can be restored.
3. Keep a private copy of: the list of team emails (and roles), the Access policy, where each secret came from (admin-setup.md).
4. Don't rehearse Time Travel on the live database. To practise B safely, run steps 1, 2 and 4 and look at `db/seed.sql`, or restore into a throw-away copy of the database name (`wrangler d1 create drwasiullah-test`, point a scratch config at it) — never at `drwasiullah`.

## G. Known gaps (could be closed if wanted)
Banners, announcements and notices, the counters (stats) and the audit log are not in the nightly git backup (the repository is public, and the audit log and users must never go there). If losing banners/announcements matters, the nightly job can be extended to include them; counters and audit could go to a private location instead. Ask Claude.
