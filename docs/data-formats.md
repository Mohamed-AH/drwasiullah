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

The daily sync prints a "Needs a look" list for every change in classification: lessons that moved series or number, new lessons that matched no series, new lessons without a number, and lesson numbers that became duplicated. `python tools/list_playlists.py` shows whether the channel's YouTube playlists agree with our series.

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

## Mirrored media: `site/data/media.json`

Written by `tools/mirror_media.py`: `{ "<original URL>": { "url": "https://media.drwasiullah.com/…", "key", "sha256", "size" } }`. It is not sent to browsers. `scripts/build.mjs` merges it into `dist/data/library.json` (our copy becomes `src`/`url`, the original is kept as `src_alt`/`url_alt`), and the audio player falls back to `src_alt` if our copy fails. Setup: [mirror-setup.md](mirror-setup.md).

## Optional: `site/data/bio.json`

Biography page, supplied by the Sheikh's team. Format in [bio-spec.md](bio-spec.md) and [bio.example.json](bio.example.json). Until the file exists there is no `/about/` page and no link to it.
