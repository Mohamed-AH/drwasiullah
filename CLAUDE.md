# CLAUDE.md — drwasiullah.com

Arabic website that organises the lessons, lectures, khutab and books of **الشيخ أ.د. وصي الله بن محمد عباس
حفظه الله** for Arabic-speaking students of knowledge. Live at https://drwasiullah.com.
**Roadmap:** see `ROADMAP.md` — currently a *DRAFT pending owner review*; do not treat it as approved
or start its phases until the owner confirms (then copy the approved phase list into this file).

## Layout
- `site/` — the whole website (plain static files, no build step): `index.html`, `app.js` (router + views),
  `styles.css`, `icons.js` (Lucide, inlined), `fonts/` (self-hosted), `catalogue.json` (YouTube),
  `data/library.json` (WordPress/archive.org audio, khutab, books), `_headers`.
- `ingest.py` / `manage.py` / `export.py` / `schema.sql` / `config.json` — owner's YouTube pipeline → `videos.db` (SQLite, local review).
- `build_catalogue.py` — `videos.db` → `site/catalogue.json` (derives series, lesson numbers, books from Arabic titles; `SERIES`/`SECTION_OF` at the top).
- `import_wordpress.py` — saved WordPress pages → `site/data/library.json` (needs `requirements.txt`).
- `tools/measure_storage.py` — sums remote media sizes (run where archive.org is reachable).
- `wrangler.jsonc` — Cloudflare Workers static-assets deploy of `site/` (no build). `DEPLOY.md` — hosting/domain guide. `dead_links.txt` — source URLs known to be 404 (skipped by the importer). `tests/xss_check.mjs` — input-handling security test. `docs/` — instructions for the owner's team.

## Commands
- Preview: `cd site && python3 -m http.server 8000`
- Refresh YouTube data: `python ingest.py` (needs `YOUTUBE_API_KEY` in `.env`) then `python build_catalogue.py`
- Re-import WordPress: `python import_wordpress.py <folder of saved pages>`
- Deploy: merge to `main` → Cloudflare builds automatically. Work on the feature branch given for the session; never push elsewhere.

## Owner decisions (Oct 2026)
- Hosting is **Cloudflare only** (Netlify/GitHub Pages config deleted). Repo is **public**. Domain drwasiullah.com (Namecheap → Cloudflare DNS).
- **Never download from YouTube.** The Sheikh's team supplies the audio for the video lessons (spec in `docs/audio-delivery-spec.md`); the bio text and photo also come from the team.
- Existing audio stays on archive.org unless/until mirrored; R2's free tier is **per Cloudflare account** and shared with the owner's other project — don't assume free storage.
- The roadmap (`ROADMAP.md`) is still a draft until the owner approves it.

## Conventions (decided with the owner — keep)
- **Language/direction:** Arabic, RTL. Fonts: Aref Ruqaa (display only — unreadable small), Reem Kufi (numerals/labels), Noto Naskh Arabic (body). Digits in titles shown Arabic-Indic.
- **Name:** always the full name «الشيخ وصي الله بن محمد عباس» followed by «حفظه الله» (visible on mobile too).
- **Dates:** show **Hijri only** (Umm al-Qura via `Intl`, or the source's own Hijri `hd`). Catalogue Gregorian dates are Riyadh-local (UTC+3) and only used for sorting/conversion.
- **Design:** "manuscript library" — parchment/ink/rubric-red/gold, series as book spines on a shelf, TOC-style lists, staggered load motion (respect `prefers-reduced-motion`), dark theme "ink night". Icons: Lucide only (no emoji, no hand-drawn icons). The seal is a blank red diamond (no letter).
- **Navigation:** header nav on desktop (≥1180 px); hamburger drawer + bottom bar (≤900 px) with raised centre search button. Sections: الدروس المرئية، الدروس الصوتية، المحاضرات، الخطب، الدروس بالأردية، الكتب — a section appears only when it has content.
- **Compatibility:** must work on old iOS Safari (iPhone 7, iOS 15): no `<button>` as flex/grid container for centring (use absolute centring), `color-mix()` always with a flat fallback before it, no backdrop-filter on the header (it must be opaque).
- **Safety:** every external string goes through `esc()` before `innerHTML`. **All user input goes through `cleanQuery()`** (length/word caps, control + bidi characters stripped), URL parameters are whitelisted (`oneOf`), route segments use `safeDecode()`, lookup tables are `Object.create(null)`, and every URL from data goes through `safeUrl()` (https only) / `safeYt()`. Run `tests/xss_check.mjs` after touching `app.js`. No third-party scripts. Never commit secrets (`.env` is git-ignored). Don't commit `__pycache__`, wheels, archives.

## Content integrity (important)
- Do **not** invent biographical, fiqh or scholarly content, attributions or translations. Bio/English titles come from the owner or the Sheikh's official sources.
- Only the Sheikh's own lessons belong on the site (the YouTube channel has other speakers; `build_catalogue.py` includes a video only if CONFIRMED/approved or his name is in the title). Don't auto-publish unmatched uploads.
- Imported titles/dates come from the source pages; fix data by changing the importer or the source, not by hand-editing generated JSON.

## Testing
`tests/xss_check.mjs` (see README) must pass. Verify UI changes with Playwright (Chromium is installed at `/opt/pw-browsers/chromium`): serve `site/`, check desktop 1280 px and mobile 390/414 px, light and dark, zero console errors. Data scripts: run them and spot-check counts. (Planned: axe-core + Lighthouse CI — see roadmap.)

## Known limits of the build environment
Outbound network is allow-listed: YouTube, wordpress.com and archive.org are **blocked** from the cloud session, so media playback and live data can't be tested there — say so rather than claiming it works.
