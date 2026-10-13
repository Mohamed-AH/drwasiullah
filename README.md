# drwasiullah.com

An Arabic (right-to-left) website that organises the lessons, lectures, khutab and books of الشيخ أ.د. وصي الله بن محمد عباس حفظه الله. Live at https://drwasiullah.com.

His material was spread across a YouTube channel (shared with other speakers), an older WordPress site, and files on archive.org. This site puts it in one place: browse by series and book, search, play, download. Right now that is about 3,300 lessons (944 from YouTube, 857 hours of video; the rest audio, including 614 Fath al-Bari pieces linked from makkahscholars.org and 85 videos from the Haram guidance channel), 24 books (29 PDFs), in 29 series. A password-less **admin portal** lets the team add and correct content without touching code ([docs/admin-manual.md](docs/admin-manual.md)).

## What it had to satisfy

- **Very low running cost.** No server to rent or patch. The public site is plain files; the admin portal runs on Cloudflare's free tier.
- **Safe editing by non-programmers.** Editors and admins work in a portal with roles, an audit log and a Publish button; the public site never talks to the database to show a lesson.
- **Fast on old phones and slow connections.** An iPhone 7 on iOS 15 is a supported device.
- **Findable in a search engine.** Every lesson needs its own URL and real HTML.
- **Proper Arabic.** Right-to-left layout, search that ignores diacritics and letter variants, Hijri dates, readable fonts.
- **Editorial control.** The YouTube channel includes other speakers; only the Sheikh's lessons may appear.

## How it works

```
YouTube channel ── daily GitHub Action ──► data/videos.jsonl ─► site/catalogue.json ─┐
audio + PDFs ───── tools/mirror_media.py ─► R2 bucket ─► site/data/media.json ───────┤
                                                                                     │
Admin portal (admin.drwasiullah.com: Cloudflare Access + Worker + D1 database + R2)  │
   editors/admins save changes ──► "Publish" ──► GitHub Action exports the database ─┤
   ► site/data/{library,makkah,haram,overrides,order,schedule,home}.json (git)       │
                                                                                     ▼
                                        scripts/build.mjs   (Node, no dependencies, about 15 s)
                                                                                     ▼
                                        dist/: ~3,300 HTML files + 2 JSON files + 1 CSS file + a few small JS files
                                                                                     ▼
                                        Cloudflare serves the files; media comes from R2 or YouTube
                                        + a small public Worker: /health, /api/event (counters), /api/live (banners)
```

- **Static pages.** Every lesson, series and section is an ordinary HTML file generated at build time, so it is indexable and readable before any JavaScript runs. JavaScript adds search, filters, in-page navigation and the players. The same page-rendering code runs in Node (build) and in the browser.
- **No framework, no npm dependencies.** About 20 KB of JavaScript and 8 KB of CSS, gzipped, plus 280 KB of self-hosted fonts. Search runs in the browser over two JSON files (about 63 KB gzipped together), fetched after the page is shown.
- **The site doesn't stream media.** YouTube lessons stay on YouTube (a thumbnail that loads the player on click). Audio and PDFs are plain files in a Cloudflare R2 bucket behind `media.drwasiullah.com`. If our copy of an audio file fails, the player switches to the original archive.org URL.
- **Deploying is a merge.** Merging to `main` makes Cloudflare run the build and publish `dist/` (`wrangler.jsonc`, see [DEPLOY.md](DEPLOY.md)). The portal's Publish button does the same by committing the exported data to `main`.
- **The database is the editors' workspace, git is the public record.** Content is edited in a Cloudflare D1 database; Publish exports the published rows back into the JSON files in git, so every publish is a commit (free history, easy rollback) and the live site stays static. Only three small things are served live, without a rebuild: banners, announcements and "no lesson tonight" notices (cached for a minute).
- **The admin portal** (`admin/`) is a separate Worker: server-rendered Arabic pages with no framework, protected by Cloudflare Access (Google or an emailed code) plus its own user list and roles. Features: audio upload to R2, editing (including YouTube lessons, as non-destructive patches), arranging lesson order, books, banners, announcements, weekly schedule, home page layout, anonymous usage statistics, reports and CSV exports, audit log.

## Running costs

| item | cost |
|---|---|
| Domain | yearly registration at Namecheap |
| Hosting and bandwidth | Cloudflare static assets; no charge so far |
| Admin portal (Worker, D1 database, Access login, nightly backup) | free tiers; no charge so far (limits are listed in [docs/admin-manual.md](docs/admin-manual.md) §7) |
| Audio and PDF storage | Cloudflare R2. The first 10 GB per account is free; charges apply beyond that. R2 has no egress fees. |
| YouTube Data API | free quota; a daily sync uses about 40 of 10,000 units |
| Builds and the daily sync | GitHub Actions, free for public repositories |

## What was checked, and how

- **Tests, public site:** `tests/e2e.mjs` (27 checks: pre-rendered pages, navigation, search, players, 404, old links), `tests/xss_check.mjs` (hostile input: script injection, oversized or malformed URLs), `tests/a11y_check.mjs` (axe-core on 12 pages, light and dark, desktop and mobile; 0 violations), `tests/home_check.mjs`, `tests/order_check.mjs`, `tests/overrides_check.mjs` (data rules). Run them after any front-end change.
- **Tests, portal and live features:** `tests/admin_run_all.sh` starts a throw-away local database and Worker and runs the whole portal suite (login tokens, every page and permission, browser upload with a multi-part file, editing, drag and keyboard reordering, live layer, home layout, analytics, reports, axe on the pages, and "database → export → build" checks); `tests/analytics_run.sh` and `tests/live_run.sh` test the public Worker endpoints in a browser. `node scripts/db.mjs verify` proves the database reproduces the data files byte for byte. It takes about four minutes; run it in the background.
- **Lighthouse**, run locally against the built site with gzip on: accessibility, SEO and best practices 100, performance 90–95. These are lab numbers, not measurements from real visitors.
- **Security:** user input is length-capped and cleaned, URL parameters are whitelisted, data URLs must be https, the site loads no third-party scripts of its own (Cloudflare's analytics beacon is the one allowed exception), and a Content-Security-Policy is enforced (`site/_headers`).
- **Not tested:** screen readers (NVDA, VoiceOver, TalkBack); YouTube and archive.org playback from CI, which can't reach them; behaviour under real traffic; touch dragging on a real phone; Cloudflare's own edge behaviour (caching, free-plan CPU limit) — these were checked by the owner on the live site as each portal phase shipped.

## Keeping it up to date

- **Content changes** are made in the admin portal ([docs/admin-manual.md](docs/admin-manual.md)); setup and deployment are in [docs/admin-setup.md](docs/admin-setup.md) and [docs/d1-setup.md](docs/d1-setup.md). The files that Publish writes are owned by the database: never hand-edit them.
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
| `import_wordpress.py` | saved WordPress pages → `site/data/library.json` (one-off; the database owns that file now) |
| `admin/` | the admin portal Worker (`admin/src/*.mjs`, config `admin/wrangler.jsonc`) |
| `worker/index.js` | public Worker: `/health`, `/api/event`, `/api/live` |
| `db/migrations/`, `scripts/db.mjs` | database schema; seed / export / verify / mirror-catalogue |
| `.github/workflows/` | `publish.yml` (Publish), `youtube-sync.yml` (daily), `d1-backup.yml` (nightly), `health.yml` (every 6 h) |
| `scripts/make_report.mjs` | printable content report (PDF) for the Sheikh's team |
| `tools/` | link checker, R2 mirror, storage measurement, text form of the video database |
| `.github/workflows/youtube-sync.yml` | the daily sync |
| `docs/` | data formats, setup guides, specs for the Sheikh's team |
| `ROADMAP.md`, `CLAUDE.md` | plan and decisions; working notes for AI-assisted sessions |

## Using it for another scholar or archive

The structure carries over; the content-specific parts are few.

0. Skip the portal at first: without it the site works from the JSON files alone (delete `admin/`, `db/`, the Publish workflow and the live endpoints in `worker/`, or leave them unused).
1. Set the name in `site/js/core.js` (`NAME`) and the name variants in `config.json`, which decide which videos count as his.
2. Define sections (`SECTIONS` in `core.js`) and series rules (`SERIES` in `build_catalogue.py`). Series are derived from title patterns, so they need maintaining as new series start.
3. Put non-YouTube content into `site/data/library.json` ([format](docs/data-formats.md)). `import_wordpress.py` fits one particular WordPress export; for another source, write a script that produces the same JSON.
4. Create a Cloudflare project for `dist/`, add your domain, and optionally an R2 bucket for the media.
5. Arabic text in `views.js` is written directly in the code; there is no translation layer yet.

## Limits and trade-offs

- **Series and lesson numbers are derived from titles with patterns.** It fits this channel's naming habits, and a title in a new style can land in the wrong series or without a number. Publication does not depend on it (that rests on the speaker's name). The daily sync reports lessons that moved, matched no series, or share a number, and any lesson can be fixed by hand ([docs/data-formats.md](docs/data-formats.md)). The channel's own playlists are used as a second opinion: they place lessons the patterns miss, and disagreements are listed for a person to decide.
- **The portal is built for a small team on free tiers.** Cloudflare Access (50 users), D1 (100,000 writes a day) and Workers (100,000 requests a day, 10 ms CPU on the free plan) are enough here, but the big report pages are the first thing to watch (see CLAUDE.md, "Decisions and consequences"). Publishing takes about two minutes because it is a real build and deploy.
- **Some media still depends on third parties.** Video stays on YouTube, and any audio or PDF not yet copied to our own storage is served from its original host.
- **Client-side search suits a few thousand items.** Past that, the JSON files would need splitting or a search service.
- **Arabic only for now.** An English edition is planned in [ROADMAP.md](ROADMAP.md).
- **The audio for the video lessons has to come from the Sheikh's team.** The project does not download audio from YouTube.
- **The mirror and link-check tools are run by hand,** not scheduled.

## More

[docs/admin-manual.md](docs/admin-manual.md) / [Arabic](docs/admin-manual.ar.md) (how to use the portal) · [docs/admin-setup.md](docs/admin-setup.md) (portal setup and deploy) · [docs/admin-portal-spec.md](docs/admin-portal-spec.md) (the agreed design) · [ROADMAP.md](ROADMAP.md) (phases, decisions, risks, what is left) · [DEPLOY.md](DEPLOY.md) (hosting and domain) · [docs/data-formats.md](docs/data-formats.md) · [docs/youtube-sync.md](docs/youtube-sync.md) · [docs/mirror-setup.md](docs/mirror-setup.md) · [docs/seo-setup.md](docs/seo-setup.md)
