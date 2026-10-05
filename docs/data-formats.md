# Data formats and pipelines

Reference for the files the site is built from. The overview is in the [README](../README.md).

## YouTube: `data/videos.jsonl` → `site/catalogue.json`

`ingest.py` reads the channel's uploads through the YouTube Data API (`channels.list` → uploads playlist → `playlistItems.list` → `videos.list`, 50 videos per call) and upserts them into SQLite (`videos.db`, schema in `schema.sql`). The daily GitHub Action does this on a scratch copy; see [youtube-sync.md](youtube-sync.md). `data/videos.jsonl` is the same table as text, one video per line, so git can diff and merge it. `python tools/videos_text.py load|dump` converts between the two.

Fields that matter in the `videos` table:

| field | meaning |
|---|---|
| `youtube_id`, `title_original`, `published_at`, `duration_iso`, `thumbnail_url` | straight from YouTube |
| `speaker_score`, `speaker_status` | automatic guess, see below |
| `series`, `subject`, `lesson_number`, `title_ar` | set by hand with `manage.py`; they override what `build_catalogue.py` derives from the title |

**Whose lesson is it?** A configured name or alias (`config.json`) in the title gives the strongest score; a match in the description or tags counts for less. Statuses: `CONFIRMED` / `MANUAL_APPROVED` (published), `REVIEW` (published only if the title names the Sheikh), `REJECTED` / `MANUAL_REJECTED` (never published), `REMOVED` (deleted or private on YouTube). A manual decision is never overwritten by a later ingest. The channel carries other speakers, so unmatched videos stay unpublished by default.

`build_catalogue.py` turns the table into `site/catalogue.json`. Series, lesson numbers and the book inside a series («كتاب …») are derived from Arabic titles with the regular expressions in `SERIES` at the top of the file. To add a series, add a line there. Videos with a zero duration (live or not yet started) are skipped until they finish.

**When a title is classified wrongly** (wrong series, no lesson number, or listed under general lectures), fix that one video by hand instead of changing the rules:

```bash
python tools/videos_text.py load                      # rebuild your local videos.db from the text file
python manage.py edit gtaYCgOGWoQ --series "شرح صحيح مسلم" --lesson-number 164
python tools/videos_text.py dump && python build_catalogue.py
```

`--series` accepts the title or id of a built-in series (it then joins that series) or any other text (it creates a separate series with that name). Manual values survive every later sync. Commit `data/videos.jsonl` and `site/catalogue.json`. If the same kind of title keeps going wrong, add a pattern to `SERIES` in `build_catalogue.py` instead.

The daily sync prints a "Needs a look" list for every change in classification: lessons that moved series or number, new lessons that matched no series, new lessons without a number, and lesson numbers that became duplicated. 
**Playlists.** `config.json` → `playlist_series` maps YouTube playlist ids to our series ids (five today: Muslim, Ibn Majah, Fadail al-Sahaba, al-Jami, al-Nasai). `ingest.py` saves their membership to `data/playlists.json`. Precedence when a lesson's series is decided: **manual value > title pattern > playlist > general lectures.** A playlist therefore only fills gaps (a title no pattern recognises, such as an abbreviated «ش مسلم»). When the title and the playlist name different series, nothing changes and the sync report lists it as a "PLAYLIST CONFLICT" so a person can decide (the playlist can be wrong too). Once a person has looked at a conflict and the title is right, add the video id to `playlist_conflicts_reviewed` in `config.json` (with a note) so it stops being reported; five such cases are recorded there. To map another playlist, add its id to `playlist_series`. `python tools/list_playlists.py` lists every playlist on the channel with how it lines up with our series, and the lessons where they disagree.

## Everything else: `site/data/library.json`

Audio series, lectures, khutab, Urdu lessons and books. It was generated from saved pages of the old WordPress site by `import_wordpress.py` (`pip install -r requirements.txt`, then `python import_wordpress.py <folder>`). That importer is written for that site's page layout; for another source, write something that produces the same JSON.

```jsonc
{
  "series":  [{ "id": "tirmidhi", "title": "شرح سنن الترمذي", "sec": "audio",       // sec: duroos | audio | lectures | khutab | urdu
                "description": "…", "unit": "الدرس", "ordered": true }],
  "lessons": [{ "id": "tirmidhi-0001", "title": "…", "series": "tirmidhi", "kind": "audio",
                "src": "https://…/file.mp3",
                "section": "كتاب الطهارة",                                          // optional grouping inside a series
                "hd": "1436-2-7", "date": "2014-11-29" }],                           // hd = Hijri date from the source (shown); date = Gregorian, for sorting
  "books":   [{ "id": "book-001", "title": "…", "group": "التحقيقات",
                "files": [{ "label": "تحميل PDF", "url": "https://…/file.pdf" }] }]
}
```

Dates are shown in the Hijri calendar only. Where the source gives a Hijri date it is used as is; otherwise the Gregorian date is converted.
`dead_links.txt` lists source URLs known to be 404; the importer skips them. `python tools/check_links.py` finds new ones and `python import_wordpress.py --prune tools/missing.txt` records them.

## Lessons from makkahscholars.org: `site/data/makkah.json`

The Sheikh's lessons are also on makkahscholars.org (scholar 39). We import two things from there, linked straight to the source's mp3 files (`mp3.makkahscholars.org`): the series «شرح فتح الباري» (group 33, 1,224 lessons) and the last two Nuzhat pieces (lessons 3727 and 3728, which share one file name: the two parts of lesson 22 of our Nuzhat audio series). The other groups duplicate series we already have.

```
python tools/scan_makkah.py     # asks the site where each file is and how big it is (no audio is downloaded; ~25 minutes, resumable) -> tools/makkah_scan.json
python tools/import_makkah.py   # -> site/data/makkah.json (commit this file)
```

`scripts/build.mjs` merges `makkah.json` into the library the browsers load; `check_links.py`, `measure_storage.py` and `mirror_media.py` read it too, so the links can be checked and, later, mirrored to our own storage. The file names on the source site carry the title and a Hijri date («كتاب بدء الوحي باب كيف بدء الوحي 18-10-1419 هـ»); the importer uses them for the title, the date (shown in Hijri; a Gregorian date is derived only for sorting) and the «كتاب» section for grouping. Consecutive lesson numbers with the same file name are the pieces of one lesson (shown as «الجزء الأول / الثاني»). Check the sample the importer prints. Both scripts run on the owner's machine (the cloud session cannot reach the site) and are polite: robots.txt is honoured and requests are spaced.

## Lessons from the Haram guidance channel: `data/haram_curation.json` → `site/data/haram.json`

A one-time import of the Sheikh's videos on the Haram's guidance channel (@twjehDM, «دروس المسجد الحرام»). `tools/find_channel_lessons.py` found the videos that name him; a person curated the result into `data/haram_curation.json` (85 videos in 10 series, one series per course, with titles, lesson numbers and Hijri dates taken from the video titles; the two videos by another speaker that the search matched were left out). The file is the source: edit it to add, remove or rename a video.

```
python tools/import_haram.py            # asks YouTube for each video's length (metadata only, needs YOUTUBE_API_KEY) -> site/data/haram.json (commit this file)
python tools/import_haram.py --no-api   # offline: no lengths
```

Videos YouTube no longer returns, or that are live with no length yet, are left out and listed (exit code 1); videos that cannot be embedded are kept and listed. `scripts/build.mjs` merges `haram.json` into the library like `makkah.json`; the lessons are `kind: "video"` with the YouTube id as `id`. Nothing here is refreshed by the daily sync.

## Mirrored media: `site/data/media.json`

Written by `tools/mirror_media.py`: `{ "<original URL>": { "url": "https://media.drwasiullah.com/…", "key", "sha256", "size" } }`. It is not sent to browsers. `scripts/build.mjs` merges it into `dist/data/library.json` (our copy becomes `src`/`url`, the original is kept as `src_alt`/`url_alt`), and the audio player falls back to `src_alt` if our copy fails. Setup: [mirror-setup.md](mirror-setup.md).

## Optional: `site/data/bio.json`

Biography page, text supplied by the Sheikh's team (`docs/bio.md`, copied unchanged into the JSON; edit the JSON directly from now on). Format in [bio-spec.md](bio-spec.md). Until the file exists there is no `/about/` page and no link to it. Files linked from it (the Sheikh's PDF) live in `site/files/`.
