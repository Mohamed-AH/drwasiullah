# Uploading many recordings at once — `tools/audio_batch.mjs`

For a folder of many lessons (like the 37 files of Oct 2026) use this tool instead of the portal's upload screen. It **optimises** the audio (the portal cannot), puts it in R2, and registers the lessons in the database. **It never publishes**: the lessons wait under «التغييرات غير المنشورة» in the portal until you press Publish.
For one or two files the portal screen is still the easiest way (`docs/admin-manual.md`).

## Git Bash tips
- Write the folder with **forward slashes**: `"C:/projects/wasiullahdrive/downloads"` (backslashes inside quotes also work, but forward slashes never go wrong). Arabic file names are fine.
- Copy the commands one line at a time. Lines starting with `#` are comments.
- If a command shows `ffmpeg: ... is it installed and on PATH?`, close Git Bash, open it again (it reads PATH when it starts) and check `ffmpeg -version`.

## What you need (once)
- Node 20+, **ffmpeg and ffprobe on PATH** (check: `ffmpeg -version`), and a Cloudflare login: `npx wrangler login` (the same account as the site; it needs R2 and D1 access). Check with `npx wrangler whoami`.
- A fresh copy of the repo: `git pull` in `C:\projects\...\drwasiullah`.
- Run every command from the repository folder, in **Git Bash** or PowerShell (the commands below are written for Git Bash; in PowerShell the same lines work, only the `#` comments differ). Your **original files are never changed or deleted**.

## File names the tool understands
`<4-digit number><title text> <day>-<month>-<Hijri year>هـ [تكملة].<mp3|wav|m4a|flac|ogg|aac>` — e.g. `0149صحيح مسلم30-2-1448هـ.mp3`.
- Titles containing «صحيح مسلم» go to the series **sahih-muslim** as «الدرس N» (number = the 4 digits).
- Anything else goes to **misc** (lectures), **unnumbered**, with the text of the file name as its title. (Change the `series` column in the spreadsheet if it belongs elsewhere.)
- A second file with «تكملة» / «تكمله» for the same number becomes **part b** (the base file is **part a**): ids `sahih-muslim-0149a`, `…0149b`, titles «الدرس 149 — الجزء الأول / الجزء الثاني».
- The Hijri date is converted to Gregorian with the same calendar the portal uses. The tool warns about a date that does not exist, numbers that jump, a lesson dated before the previous one, and a Muslim lesson that is not on a Wed/Thu/Sat.

## Step by step
```bash
# 1. scan: reads the folder, asks the database what exists, writes the spreadsheet. Nothing is changed anywhere.
node tools/audio_batch.mjs scan --dir "C:/projects/wasiullahdrive/downloads"
#    -> read the warnings. Open tools\audio_batch_work\manifest.csv in Excel to check/edit titles, sections, series, status (published / draft / skip).
#    (Save as CSV UTF-8. Do not rename the columns. Delete a row or set status=skip to leave a file out.)

# 2. TRIAL on two files first (one mp3, the WAV): convert, then LISTEN to tools\audio_batch_work\m4a\*.m4a
node tools/audio_batch.mjs convert --only sahih-muslim-0150,sahih-muslim-0162
#    compare size and sound with the originals. Tell Claude if the quality is not good enough: the settings can be changed.

# 3. everything: convert (about 1-2 min per hour of audio; files already converted are skipped), then upload to R2
node tools/audio_batch.mjs convert
node tools/audio_batch.mjs upload

# 4. register in the database. The first time, the old mis-numbered test record must be replaced (see below).
#    it prints what it will do. In Git Bash it cannot ask a question, so do it in two steps:
node tools/audio_batch.mjs register --replace sahih-muslim-0171 --dry-run     # shows the plan, writes tools/audio_batch_work/register.sql, changes nothing
node tools/audio_batch.mjs register --replace sahih-muslim-0171 --yes         # the real thing (PowerShell/cmd users can leave out --yes and type YES instead)

# 5. check
node tools/audio_batch.mjs verify
```
Then open the portal (admin.drwasiullah.com): the lessons appear in the list of unpublished changes. Open a few, play them, fix titles/sections in the portal if needed, and press **Publish**. After ~2 minutes check the site.

### The conflict of Oct 2026 (`sahih-muslim-0171`)
The first test upload was registered as lesson 171 but is the recording dated 29-4-1448, which your files call **0172**. `register --replace sahih-muslim-0171` deletes that record (its full content stays in the audit log) and then registers the real 0171 (27-4) and 0172 a/b. Without `--replace` the tool refuses and writes nothing. The old audio file stays in R2, unused.

## What the optimisation does
Mono, AAC-LC 48 kbps (m4a), loudness normalised to -16 LUFS (two passes, peaks limited to -1.5 dB), index at the front of the file (`+faststart`, so it starts playing at once), original tags removed (title / artist / album are set; nothing of the original file name), byte-for-byte reproducible. About 22 MB per hour of lesson; a 72-minute lesson is ~26 MB. The R2 name is `audio/<first 16 hex of the sha-256>.m4a` like the portal's.

## If something goes wrong
- **Every stage can simply be run again**: finished work is skipped (state is in `tools\audio_batch_work\state.json`). `convert --force` redoes conversions.
- **`register` stopped halfway / network error**: run it again. The SQL only inserts what is missing, never duplicates, and never deletes the new record.
- **A lesson is wrong after registering**: in the portal edit it, or hide it (status). Nothing is public until Publish; after Publish, hide it and Publish again.
- **`CONFLICT`**: the database already has that id or date under another number. Read the message; if the old record is the mis-numbered one use `--replace <id>`, otherwise fix the number in manifest.csv.
- **`ffmpeg: ... is it installed and on PATH?`**: install ffmpeg (a "full build" zip, add its `bin` folder to PATH) and open a new PowerShell window.
- **wrangler asks you to log in / permission error**: `npx wrangler login`.
- Undoing everything of a batch: hide the lessons in the portal (or ask Claude for the exact SQL from `register.sql`). The R2 files are harmless and cost almost nothing.

## Weekly use
Put the new recordings in the folder and run `scan` (use a new `--work` folder or `--force` to rescan), `convert`, `upload`, `register`, `verify`. Lessons already registered are recognised and skipped.

## Technical notes (for the developer)
- Code: `tools/audio_batch.mjs` (stages, ffmpeg, wrangler) and `tools/audio_batch_lib.mjs` (parsing, planning, conflict rules, CSV, SQL — pure, tested). Tests: `node --no-warnings tests/audio_batch_check.mjs [--wrangler]` — includes the real 37 names (`tests/audio_batch_names.txt`), a byte-for-byte comparison of the registration SQL with the portal's `addLessons()` on SQLite, the ffmpeg output properties, and (with `--wrangler`) the whole pipeline against a local D1 + R2.
- Registration is SQL run with `wrangler d1 execute --remote --file` (not the portal API: the portal accepts only Cloudflare Access logins). Rows are written like the portal writes them, origin `library`, audit actor `script:audio_batch`, so the portal counts them as unpublished changes.
- Local test mode: `--local <dir>` uses a wrangler state folder instead of the real account.
