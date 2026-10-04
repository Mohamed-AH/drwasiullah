# drwasiullah.com

An Arabic (right-to-left) website that organises the lessons, lectures, khutab and books of الشيخ أ.د. وصي الله بن محمد عباس حفظه الله. Live at https://drwasiullah.com.

His material was spread across a YouTube channel (shared with other speakers), an older WordPress site, and files on archive.org. This site puts it in one place: browse by series and book, search, play, download. Right now that is 944 YouTube lessons (857 hours), 1,037 audio lessons, 24 books (29 PDFs), in 18 series.

## What it had to satisfy

- **Very low running cost.** No server to rent or patch, no database, no admin login.
- **Fast on old phones and slow connections.** An iPhone 7 on iOS 15 is a supported device.
- **Findable in a search engine.** Every lesson needs its own URL and real HTML.
- **Proper Arabic.** Right-to-left layout, search that ignores diacritics and letter variants, Hijri dates, readable fonts.
- **Editorial control.** The YouTube channel includes other speakers; only the Sheikh's lessons may appear.

## How it works

```
YouTube channel ── daily GitHub Action ──► data/videos.jsonl ─► site/catalogue.json ─┐
WordPress pages ── import_wordpress.py ──► site/data/library.json ───────────────────┤
audio + PDFs ───── tools/mirror_media.py ─► R2 bucket ─► site/data/media.json ───────┤
                                                                                     ▼
                                        scripts/build.mjs   (Node, no dependencies, about 5 s)
                                                                                     ▼
                                        dist/: ~2,000 HTML files + 2 JSON files + 1 CSS file + a few small JS files
                                                                                     ▼
                                        Cloudflare serves the files; media comes from R2 or YouTube
```

- **Static pages.** Every lesson, series and section is an ordinary HTML file generated at build time, so it is indexable and readable before any JavaScript runs. JavaScript adds search, filters, in-page navigation and the players. The same page-rendering code runs in Node (build) and in the browser.
- **No framework, no npm dependencies.** About 20 KB of JavaScript and 8 KB of CSS, gzipped, plus 280 KB of self-hosted fonts. Search runs in the browser over two JSON files (about 63 KB gzipped together), fetched after the page is shown.
- **The site doesn't stream media.** YouTube lessons stay on YouTube (a thumbnail that loads the player on click). Audio and PDFs are plain files in a Cloudflare R2 bucket behind `media.drwasiullah.com`. If our copy of an audio file fails, the player switches to the original archive.org URL.
- **Deploying is a merge.** Merging to `main` makes Cloudflare run the build and publish `dist/` (`wrangler.jsonc`, see [DEPLOY.md](DEPLOY.md)).

## Running costs

| item | cost |
|---|---|
| Domain | yearly registration at Namecheap |
| Hosting and bandwidth | Cloudflare static assets; no charge so far |
| Audio and PDF storage | Cloudflare R2. The first 10 GB per account is free; charges apply beyond that. R2 has no egress fees. |
| YouTube Data API | free quota; a daily sync uses about 40 of 10,000 units |
| Builds and the daily sync | GitHub Actions, free for public repositories |

## What was checked, and how

- **Tests:** `tests/e2e.mjs` (27 checks: pre-rendered pages, navigation, search, players, 404, old links), `tests/xss_check.mjs` (hostile input: script injection, oversized or malformed URLs), `tests/a11y_check.mjs` (axe-core on 12 pages, light and dark, desktop and mobile; 0 violations). Run them after any front-end change.
- **Lighthouse**, run locally against the built site with gzip on: accessibility, SEO and best practices 100, performance 90–95. These are lab numbers, not measurements from real visitors.
- **Security:** user input is length-capped and cleaned, URL parameters are whitelisted, data URLs must be https, the site loads no third-party scripts of its own (Cloudflare's analytics beacon is the one allowed exception), and a Content-Security-Policy is enforced (`site/_headers`).
- **Not tested:** screen readers (NVDA, VoiceOver, TalkBack); YouTube and archive.org playback from CI, which can't reach them; behaviour under real traffic.

## Keeping it up to date

- **New YouTube lessons** arrive through a daily GitHub Action ([docs/youtube-sync.md](docs/youtube-sync.md)). It refuses to publish if lessons suddenly disappear, and a video appears only if its title names the Sheikh or someone approved it.
- **Dead links** are found with `python tools/check_links.py`. It separates files that are gone (404) from files whose host is failing (5xx), and only the first kind is ever removed.
- **Own copies of the media** are made with `python tools/mirror_media.py`, run by hand on a machine that can reach the sources ([docs/mirror-setup.md](docs/mirror-setup.md)).

## Run it locally

```bash
node scripts/build.mjs && (cd dist && python3 -m http.server 8000)   # http://localhost:8000
```

Tests need Playwright (`npm i -D playwright axe-core`) and the built site being served:

```bash
node tests/e2e.mjs        http://localhost:8000
node tests/xss_check.mjs  http://localhost:8000
node tests/a11y_check.mjs http://localhost:8000
```

## Where things are

| path | what |
|---|---|
| `site/js/core.js` | data model, helpers, input cleaning, URL builders (no DOM) |
| `site/js/views.js` | every page as a function that returns HTML and SEO metadata |
| `site/js/app.js` | browser only: navigation, search, players |
| `scripts/build.mjs` | pre-renders `site/` into `dist/`, writes sitemap, redirects, 404 |
| `ingest.py`, `build_catalogue.py`, `manage.py` | YouTube → SQLite → `site/catalogue.json`; manual curation |
| `import_wordpress.py` | saved WordPress pages → `site/data/library.json` |
| `tools/` | link checker, R2 mirror, storage measurement, text form of the video database |
| `.github/workflows/youtube-sync.yml` | the daily sync |
| `docs/` | data formats, setup guides, specs for the Sheikh's team |
| `ROADMAP.md`, `CLAUDE.md` | plan and decisions; working notes for AI-assisted sessions |

## Using it for another scholar or archive

The structure carries over; the content-specific parts are few.

1. Set the name in `site/js/core.js` (`NAME`) and the name variants in `config.json`, which decide which videos count as his.
2. Define sections (`SECTIONS` in `core.js`) and series rules (`SERIES` in `build_catalogue.py`). Series are derived from title patterns, so they need maintaining as new series start.
3. Put non-YouTube content into `site/data/library.json` ([format](docs/data-formats.md)). `import_wordpress.py` fits one particular WordPress export; for another source, write a script that produces the same JSON.
4. Create a Cloudflare project for `dist/`, add your domain, and optionally an R2 bucket for the media.
5. Arabic text in `views.js` is written directly in the code; there is no translation layer yet.

## Limits and trade-offs

- **Series and lesson numbers are derived from titles with patterns.** It fits this channel's naming habits, and a title in a new style can land in the wrong series or without a number. Publication does not depend on it (that rests on the speaker's name). The daily sync reports lessons that moved, matched no series, or share a number, and any lesson can be fixed by hand ([docs/data-formats.md](docs/data-formats.md)). Using the channel's own playlists instead is being evaluated.
- **Some media still depends on third parties.** Video stays on YouTube, and any audio or PDF not yet copied to our own storage is served from its original host.
- **Client-side search suits a few thousand items.** Past that, the JSON files would need splitting or a search service.
- **Arabic only for now.** An English edition is planned in [ROADMAP.md](ROADMAP.md).
- **The audio for the video lessons has to come from the Sheikh's team.** The project does not download audio from YouTube.
- **The mirror and link-check tools are run by hand,** not scheduled.

## More

[ROADMAP.md](ROADMAP.md) (phases, decisions, risks) · [DEPLOY.md](DEPLOY.md) (hosting and domain) · [docs/data-formats.md](docs/data-formats.md) · [docs/youtube-sync.md](docs/youtube-sync.md) · [docs/mirror-setup.md](docs/mirror-setup.md) · [docs/seo-setup.md](docs/seo-setup.md)
