# CLAUDE.md — drwasiullah.com

Arabic website that organises the lessons, lectures, khutab and books of **الشيخ أ.د. وصي الله بن محمد عباس
حفظه الله** for Arabic-speaking students of knowledge. Live at https://drwasiullah.com.
**Roadmap:** `ROADMAP.md` is **approved by the owner** (Oct 2026). Phase list below; Phase 1 is in progress.

## Layout
- `site/` — website **source**: `shell.html` (page template), `styles.css`, `fonts/`, `favicon.svg`, `og/default.png`, `_headers`, `catalogue.json` (YouTube), `data/library.json` (archive.org audio, khutab, books), optional `data/bio.json` (from the Sheikh's team), and `js/`:
  `core.js` (data model, helpers, sanitisers, URL builders — no DOM), `views.js` (every page as a pure function returning HTML + SEO metadata), `app.js` (browser: History-API navigation, search/filters, players, drawer), `icons.js` (Lucide), `theme-init.js`.
- `scripts/build.mjs` — **pre-renders `site/` → `dist/`** (≈ 2,000 real HTML pages, `sitemap.xml`, `robots.txt`, `_redirects`, `404.html`). `dist/` is git-ignored. `scripts/make_og.mjs` regenerates the share image.
- `ingest.py` / `manage.py` / `export.py` / `schema.sql` / `config.json` — owner's YouTube pipeline → `videos.db` (SQLite, local review).
- `build_catalogue.py` — `videos.db` → `site/catalogue.json` (derives series, lesson numbers, books from Arabic titles; `SERIES`/`SECTION_OF` at the top).
- `import_wordpress.py` — saved WordPress pages → `site/data/library.json` (needs `requirements.txt`); `dead_links.txt` — source URLs known to be 404 (skipped by the importer).
- `tools/measure_storage.py` — sums remote media sizes. `tests/` — `xss_check.mjs`, `e2e.mjs`, `a11y_check.mjs`. `docs/` — instructions for the owner's team (audio delivery, bio) and SEO setup.
- `wrangler.jsonc` — Cloudflare Workers static-assets deploy: runs the build, publishes `dist/`. `DEPLOY.md` — hosting/domain guide.

## Commands
- Build + preview: `node scripts/build.mjs && (cd dist && python3 -m http.server 8000)` (the site must be built; `site/` alone is not servable)
- Refresh YouTube data: `python ingest.py` (needs `YOUTUBE_API_KEY` in `.env`) then `python build_catalogue.py`
- Re-import WordPress: `python import_wordpress.py <folder of saved pages>`
- Deploy: merge to `main` → Cloudflare runs the build (`wrangler.jsonc`) and publishes `dist/`. Work on the feature branch given for the session; never push elsewhere.

## Roadmap (approved)
0. Foundations — merge to `main`, delete old Netlify site, 2FA/DNSSEC/branch protection (owner), cleanup. *(mostly done)*
1. **Findable & trustworthy — IN PROGRESS:** real URLs + pre-rendering + sitemap + structured data **(done)**; accessibility baseline, axe-clean **(done)**; input sanitisation + CSP report-only **(done)**; Search Console (owner, `docs/seo-setup.md`); bio page **built but dormant until the team supplies `data/bio.json`** (`docs/bio-spec.md`).
2. Own the data: PDFs → R2 (separate bucket `drwasiullah-media`, `media.drwasiullah.com`); optional mirror of existing audio (R2 account already holds 12.19 GB in `wurud-audio`; budget ≤ US$1/month).
3. Auto-update: YouTube daily sync (GitHub Actions); Mixlr (needs its owner).
4. Audio for video lessons **supplied by the Sheikh's team** (`docs/audio-delivery-spec.md`), normalised to mono/−16 LUFS/AAC 48 kbps. No YouTube downloading.
5. English edition (**Hijri dates only**, in both languages).

## Owner decisions (Oct 2026)
- Hosting is **Cloudflare only** (Netlify/GitHub Pages config deleted). Repo is **public**. Domain drwasiullah.com (Namecheap → Cloudflare DNS).
- **Never download from YouTube.** The Sheikh's team supplies the audio for the video lessons (spec in `docs/audio-delivery-spec.md`); the bio text and photo also come from the team.
- Existing audio stays on archive.org unless/until mirrored; R2's free tier is **per Cloudflare account** and shared with the owner's other project — don't assume free storage.
- Budget ≤ US$1/month for storage. **Hijri dates only, in Arabic and English.** Roadmap approved.

## Conventions (decided with the owner — keep)
- **Language/direction:** Arabic, RTL. Fonts: Aref Ruqaa (display only — unreadable small), Reem Kufi (numerals/labels), Noto Naskh Arabic (body). Digits in titles shown Arabic-Indic.
- **Name:** always the full name «الشيخ وصي الله بن محمد عباس» followed by «حفظه الله» (visible on mobile too).
- **Dates:** show **Hijri only** (Umm al-Qura via `Intl`, or the source's own Hijri `hd`). Catalogue Gregorian dates are Riyadh-local (UTC+3) and only used for sorting/conversion.
- **Design:** "manuscript library" — parchment/ink/rubric-red/gold, series as book spines on a shelf, TOC-style lists, staggered load motion (respect `prefers-reduced-motion`), dark theme "ink night". Icons: Lucide only (no emoji, no hand-drawn icons). The seal is a blank red diamond (no letter).
- **URLs are real paths** (`/series/<id>/`, `/lesson/<id>/`, `/section/<id>/`, `/books/`, `/about/`, `/search/`), never `#/…` (old hash links are redirected by `app.js`). Build links with `href.*` from `core.js`. A new page type = a function in `views.js` + a route in `resolve()` and in `scripts/build.mjs`. A section with one series has no page of its own (it links to the series; the build writes a `_redirects` line).
- **Navigation:** header nav on desktop (≥1180 px); hamburger drawer + bottom bar (≤900 px) with raised centre search button. Sections: الدروس المرئية، الدروس الصوتية، المحاضرات، الخطب، الدروس بالأردية، الكتب — a section appears only when it has content.
- **Compatibility:** must work on old iOS Safari (iPhone 7, iOS 15): no `<button>` as flex/grid container for centring (use absolute centring), `color-mix()` always with a flat fallback before it, no backdrop-filter on the header (it must be opaque).
- **Safety:** every external string goes through `esc()` before `innerHTML`. **All user input goes through `cleanQuery()`** (length/word caps, control + bidi characters stripped), URL parameters are whitelisted (`oneOf`), route segments use `safeDecode()`, lookup tables are `Object.create(null)`, and every URL from data goes through `safeUrl()` (https only) / `safeYt()`. Run `tests/xss_check.mjs` after touching `app.js`. No third-party scripts. Never commit secrets (`.env` is git-ignored). Don't commit `__pycache__`, wheels, archives.

## Content integrity (important)
- Do **not** invent biographical, fiqh or scholarly content, attributions or translations. Bio/English titles come from the owner or the Sheikh's official sources.
- Only the Sheikh's own lessons belong on the site (the YouTube channel has other speakers; `build_catalogue.py` includes a video only if CONFIRMED/approved or his name is in the title). Don't auto-publish unmatched uploads.
- Imported titles/dates come from the source pages; fix data by changing the importer or the source, not by hand-editing generated JSON.

## Testing
`tests/xss_check.mjs`, `tests/e2e.mjs` and `tests/a11y_check.mjs` (see README) must pass after front-end changes. Verify UI changes with Playwright (Chromium is installed at `/opt/pw-browsers/chromium`): serve `site/`, check desktop 1280 px and mobile 390/414 px, light and dark, zero console errors. Data scripts: run them and spot-check counts. (Planned: axe-core + Lighthouse CI — see roadmap.)

## Known limits of the build environment
Outbound network is allow-listed: YouTube, wordpress.com and archive.org are **blocked** from the cloud session, so media playback and live data can't be tested there — say so rather than claiming it works.
