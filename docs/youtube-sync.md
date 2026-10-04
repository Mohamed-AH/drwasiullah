# Daily YouTube sync (Phase 3a)

A GitHub Action (`.github/workflows/youtube-sync.yml`) runs every day at 03:17 UTC (and on demand from the Actions tab → *YouTube sync* → *Run workflow*).

**What it does**
1. Reads the channel through the YouTube Data API (about 40 quota units a day; the limit is 10,000).
2. Adds new videos to `data/videos.jsonl`, rebuilds `site/catalogue.json`, checks the site still builds, and publishes the change. Cloudflare then redeploys.
3. Writes a summary on the run page: new lessons, lessons that disappeared, how many videos wait for review.

**What gets published automatically:** only videos whose title names the Sheikh (or that you approved by hand with `manage.py`). Other speakers' uploads stay in the database with status `REVIEW` and never reach the site. Live streams and premieres appear after they finish.
Videos deleted/made private on YouTube are marked `REMOVED` and disappear from the site. Your manual curation (series, lesson number, Arabic title, approvals/rejections) is never overwritten.
Safety stops: if more than 3 lessons would vanish, or YouTube answers only partly, the run fails and **publishes nothing** (you get GitHub's failure email).

## One-time setup (owner)
1. GitHub repo → Settings → Secrets and variables → Actions:
   - **Secrets → New repository secret:** `YOUTUBE_API_KEY` = your key. (Your local `.env` is not visible to GitHub.) In Google Cloud, restrict the key to *YouTube Data API v3*.
   - **Variables → New repository variable:** `YOUTUBE_CHANNEL_HANDLE` = `@wahatsunnah12` (optional; this is the default).
2. Settings → Actions → General → Workflow permissions → **Read and write permissions** (needed to commit).
3. Run it once by hand (Actions → YouTube sync → Run workflow) and read the summary.
4. If you turn on branch protection for `main` later, the Action can no longer push directly: add the repository variable `SYNC_MODE` = `pr` (and tick "Allow GitHub Actions to create pull requests" in the same Actions settings page). It then opens a daily pull request that you merge.

## Your side of the workflow
`data/videos.jsonl` (text) is now the source of truth; `videos.db` is a local working copy.
- After `git pull`: `python tools/videos_text.py load` rebuilds your local `videos.db`.
- After curating with `manage.py`: `python tools/videos_text.py dump`, then `python build_catalogue.py`, then commit `data/videos.jsonl` and `site/catalogue.json`.
- Once, when convenient: `git rm --cached videos.db` and commit (keeps your local file, stops tracking the binary).
