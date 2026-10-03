# Sheikh Wasiullah Abbas — YouTube Ingest

This is the lightweight ingestion step for the Arabic digital library.

## What it does

`ingest.py`:

1. Resolves `@wahatsunnah12` with the YouTube Data API.
2. Gets the channel's uploads playlist.
3. Reads every uploaded video using pagination.
4. Fetches video metadata in batches.
5. Stores everything in `videos.db`.
6. Gives each video a conservative preliminary speaker status.

YouTube's API exposes the channel's uploads playlist through `channels.list` and the videos through `playlistItems.list`; video metadata is then retrieved with `videos.list`.

## Setup

You need a YouTube Data API v3 API key.

1. Copy `.env.example` to `.env`.
2. Replace `YOUR_API_KEY_HERE` with your API key.
3. Run:

```bash
python ingest.py
```

No external Python package is required.

## Output

The script creates:

```text
videos.db
```

The main table is:

```text
videos
```

Important fields:

- `youtube_id`
- `title_original`
- `description_original`
- `published_at`
- `thumbnail_url`
- `duration_iso`
- `speaker_score`
- `speaker_status`
- `language`
- `subject`
- `series`
- `lesson_number`
- `is_published`

## Speaker detection

This is deliberately conservative.

A title containing a configured Sheikh name/alias gets the strongest score. A description or tag match contributes less.

Videos without an obvious name match are NOT automatically rejected. They remain `REVIEW`, because a lecture can belong to the Sheikh without putting his name in the title.

Edit `config.json` to add more verified aliases or explicitly known other-speaker names.

## Important

The first ingest is only collection + preliminary classification.

Do not publish everything automatically.

The intended flow is:

YouTube
  -> ingest.py
  -> videos.db
  -> manual review/curation
  -> catalogue.json
  -> Arabic website

For a catalogue of fewer than 1,500 videos, this SQLite approach is intentionally simple.
# drwasiullah

---

# The website (`site/`)

A static Arabic (RTL) site — no build tools, no framework. It reads `site/catalogue.json`.

```text
ingest.py -> videos.db -> build_catalogue.py -> site/catalogue.json -> site/index.html
```

## Update the catalogue

```bash
python ingest.py            # pull new uploads from YouTube
python build_catalogue.py   # regenerate site/catalogue.json
```

`build_catalogue.py` includes `CONFIRMED` / `MANUAL_APPROVED` videos, plus `REVIEW` videos whose
title names the Sheikh (spelling/diacritics-insensitive). `MANUAL_REJECTED` videos and other speakers are
never included. Series, lesson numbers and books ("كتاب …") are derived from the titles; anything set by
hand in `videos.db` (`series`, `subject`, `lesson_number`, `title_ar`) overrides the automatic result.
To add a new series, add a line to `SERIES` at the top of `build_catalogue.py`.

## Develop locally

`site/` is the source; `node scripts/build.mjs` **pre-renders it into `dist/`** (one real HTML file per page — ≈ 2,000 — plus
`sitemap.xml`, `robots.txt`, `_redirects`, `404.html`). No npm dependencies.

```bash
node scripts/build.mjs && (cd dist && python3 -m http.server 8000)   # open http://localhost:8000
```

Code layout: `site/js/core.js` (data model + helpers), `site/js/views.js` (every page as a pure function — used by the build *and* the browser),
`site/js/app.js` (browser: navigation, search, players), `site/shell.html` (page template), `site/styles.css`.

## Deploy

Merge to `main`; Cloudflare runs `npx wrangler deploy`, and `wrangler.jsonc` makes it run the build first and publish `dist/`. See `DEPLOY.md`.

## Features

Arabic-aware search (ignores tashkeel and alef/ya/ta-marbuta variants), series pages grouped by book,
in-page YouTube player with previous/next lesson and the whole series beside it, shareable links
for every lesson, dark mode, mobile-friendly.

---

# Sections & the WordPress library

The site has six sections (defined at the top of `site/app.js`): الدروس المرئية، الدروس الصوتية،
المحاضرات، الخطب، الدروس بالأردية، الكتب. A section appears in the menus only once it has content.

- **YouTube content** comes from `site/catalogue.json` (built by `build_catalogue.py`; `SECTION_OF`
  there decides which section a series lives in).
- **Everything from wasiullahabbas.wordpress.com** (audio series, lectures, khutab, Urdu, books) goes in
  **`site/data/library.json`** — optional; the site works without it:

```jsonc
{
  "series":  [{ "id": "arbaeen", "title": "شرح الأربعين النووية", "sec": "audio",   // sec: duroos|audio|lectures|khutab|urdu
                "description": "…", "unit": "الدرس" }],
  "lessons": [{ "id": "arbaeen-1", "title": "…", "series": "arbaeen", "n": 1,       // n = lesson number (optional)
                "kind": "audio", "src": "https://…/file.mp3",                         // kind: audio | video (video needs a YouTube id as `id`)
                "date": "2020-05-17", "duration": 3120 }],                            // both optional; date is Gregorian, shown as Hijri
  "books":   [{ "id": "b1", "title": "…", "desc": "…", "cover": "https://…jpg", "url": "https://…pdf" }]
}
```

A section with a single series (e.g. khutab) opens straight to that list; with several (e.g. audio) it
shows the book-shelf of series. Icons are [Lucide](https://lucide.dev) (ISC licence), inlined in `site/icons.js`.

## Importing the WordPress pages

`import_wordpress.py` turns the saved pages of wasiullahabbas.wordpress.com (`wasiwordpress.rar`) into
`site/data/library.json`:

```bash
pip install -r requirements.txt            # beautifulsoup4, hijridate
# unpack the .rar (needs unrar / 7-Zip 21+ / WinRAR), then:
python import_wordpress.py path/to/wasiwordpress
```

It reads 9 audio/Urdu series, lectures, khutab and books. Source dates are mostly Hijri (in file names or
titles) and are kept as-is (`hd`); a Gregorian `date` derived from them is used only for sorting.
Audio is streamed straight from archive.org; PDFs link to the original files. Re-running regenerates the file.

## Tests

All three need Playwright (`npm i -D playwright`; `axe-core` too for the accessibility one), and a served build:

```bash
node scripts/build.mjs && (cd dist && python3 -m http.server 8000) &
node tests/xss_check.mjs  http://localhost:8000    # hostile input (XSS, oversize, NUL/RTL-override, malformed/`__proto__` URLs)
node tests/e2e.mjs        http://localhost:8000    # pre-rendered pages, hydration, navigation, legacy #/ links, search, players, 404, menu
node tests/a11y_check.mjs http://localhost:8000    # axe-core (WCAG 2.2 AA) × light/dark × desktop/mobile
```
