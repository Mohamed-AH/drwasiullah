# Roadmap — drwasiullah.com

> **Status: DRAFT for owner review.** Nothing here is approved until the owner says so; once approved, the
> phase list is copied into `CLAUDE.md`. Effort: **S** ≈ one working session, **M** ≈ 2–3, **L** ≈ 4+.
> Free-tier numbers are from memory of the providers' public pricing — **verify at sign-up**, terms change.

## 0. Where we are (snapshot, Oct 2026)

| | |
|---|---|
| Live site | https://drwasiullah.com — static files in `site/`, served by a Cloudflare Worker (`wrangler.jsonc`), domain registered at Namecheap, DNS at Cloudflare |
| Content | 944 YouTube lessons (**857 h**, 7 series) · 1,066 audio files (9 series, lectures, khutab) · 24 books / 29 PDFs |
| Where the bytes live | Video: **YouTube** · Audio: **archive.org** (all 1,066 files) · PDFs: **wasiullahabbas.wordpress.com** (+ a few on archive.org) |
| Data pipeline | `ingest.py` → `videos.db` → `build_catalogue.py` → `site/catalogue.json`; `import_wordpress.py` → `site/data/library.json` (one-off, from saved pages) |
| Front end | Vanilla JS single page app, **hash routing** (`/#/series/…`), Arabic RTL, Hijri dates, light/dark, mobile drawer + bottom nav |

## 1. Findings that shape the plan

1. **Google cannot index our pages today.** URLs look like `drwasiullah.com/#/watch/…`; everything after `#`
   is invisible to search engines, and all content is rendered by JavaScript. SEO is therefore **not**
   "add a sitemap" — it first needs **real URLs + pre-rendered HTML**. This is the single highest-value task.
2. **"Depends on WordPress" is really three different dependencies.** Audio is already on archive.org
   (a stable non-profit host). The fragile part is the **PDFs on a WordPress.com blog** and the fact that the
   *list* of lessons only exists in that blog's pages (already captured in `library.json`).
3. **Cloudflare Workers static assets can't host the media** (25 MiB per file limit) — media needs object storage.
4. **Storage is a small money problem, not a big one** (≈ US$0.06–0.35 / month, see §3) because Cloudflare R2 has no egress fee.
5. **Rights, not technology, are the gating risk** for mirroring audio. The YouTube-download route is dropped: the Sheikh's team will supply the audio (§2). Written OK to mirror existing audio/PDFs still comes first.
6. A few hygiene items found while auditing: stray files were committed (`__pycache__`, an `unrar` wheel — removed in this
   change); `videos.db` is a binary committed to git (will bloat once a bot commits to it daily); `wasiwordpress.rar`
   (4.5 MB) is no longer needed; three hosts were configured — Netlify and GitHub Pages config are now removed (Cloudflare only).
   Good news: a history scan found **no API key** ever committed.

## 2. Decisions log

| # | Decision | Status |
|---|---|---|
| D1 | Permissions. The **Sheikh's team will supply the audio for the YouTube lessons** — so we never download from YouTube (no ToS/permission problem, better quality). Still to confirm in writing: OK to mirror the existing audio/PDFs on our storage; who owns the **Mixlr** account; OK for a podcast feed. | **Partly decided** |
| D2 | Bio text + photo | **Decided:** the Sheikh's team provides them (we build the page; no biographical text is written by us) |
| D3 | Budget ceiling (suggest ≤ US$5/month on top of the domain) | Open — expected spend is cents (§3) |
| D4 | Keep archive.org as a permanent fallback | Open (recommended: yes — and see §3: it stays the **primary** host of the existing audio unless we mirror it) |
| D5 | English edition scope (UI only, or translated series/book titles?); Hijri only or Hijri + Gregorian? | Open |
| D6 | Repo visibility | **Decided: public** (unlimited free GitHub Actions minutes) |
| D7 | Hosting | **Decided: Cloudflare only.** `netlify.toml` and the GitHub Pages workflow are deleted; delete the old Netlify site in its dashboard |
| D8 | **How much of the free R2 allowance does the other project already use?** (Cloudflare dashboard → R2 → Overview → storage) | Open — decides Phase 2b |

## 3. Storage assessment

**Measured (owner ran `tools/measure_storage.py` on 2026-10-03 — HEAD requests, nothing downloaded).**

| Bucket | Measured | Not measurable | Adjusted estimate |
|---|---|---|---|
| Existing audio on archive.org | **12.83 GB** · 1,036 files · avg 12.4 MB | **30 files** (all of the Bukhari series except 6 → probably dead links, ≈ +0.4 GB if they exist) | **≈ 13.2 GB** |
| PDFs (books) | **0.18 GB** · 28 files · avg 6.5 MB | 1 file — almost certainly «المسجد الحرام» (the source page says 357 MB) | **≈ 0.55 GB** |
| **Phase 2 mirror (as-is)** | **13.0 GB** | 31 files | **≈ 13.8 GB** |

By series (GB): Abu Dawud 4.19 · Bulugh al-Maram (Urdu) 2.64 · Tirmidhi 1.89 · Tadrib 1.75 · Tawheed (Urdu) 0.92 ·
Ibn al-Salah 0.44 · Urdu lectures 0.35 · Nuzhat 0.23 · al-Jami 0.14 · Bukhari 0.13 (6 files) · khutab 0.12 · Arabic lectures 0.05.
Existing audio is already efficient (avg ≈ 12 MB/file, roughly 30–35 min at ~48 kbps).

**Projection (estimates)**

| Bucket | Size | Basis |
|---|---|---|
| Phase 2: existing audio + PDFs, as-is | **≈ 13.8 GB** | measured + adjusted above |
| Phase 4: YouTube → audio, backlog | **12.3 GB @32k · 18.5 GB @48k · 24.7 GB @64k** | 857 h × bitrate (mono) |
| Phase 4: ongoing | **≈ 4 GB / yr @48k** | last 12 months: 219 videos, 179 h |
| Thumbnails, JSON, manifests | < 0.5 GB | |
| **Total at completion (48 kbps)** | **≈ 33 GB**, +4 GB / yr | |

Re-encoding the existing audio to the uniform spec (optional Phase 4b) would not grow this: it is already around 48 kbps.

**Follow-up from the measurement:** the 30 unreachable Bukhari files and 1 PDF are a *data* issue. Re-run
`python tools/measure_storage.py` — it now prints the reason per failure (HTTP 404 = dead link at the source) and
saves the list to `tools/missing.txt`. Dead links should be hidden from the site (or fixed at the source) in Phase 0/2
so students never hit a lesson that doesn't play.

**Important — the R2 free tier is per Cloudflare *account*, not per project or bucket.** The 10 GB-month, 1 M writes and
10 M reads are shared by every bucket in the account, so a second project on the same account draws from the same
allowance (and a second account just to get another free 10 GB is against the spirit of the free plan — not planned).
That does not make storage expensive, only no longer free: usage above the allowance is billed at ≈ US$0.015 / GB-month.
Example: if the other project stores 5 GB, then PDFs + new audio + existing audio mirror (≈ 14 GB) → 19 GB total → 9 GB billable → **≈ US$0.14 / month**. Set a Cloudflare *billing usage notification* so nothing surprises us.

**Free-tier options**

| Option | Free | Beyond free | Egress | Verdict |
|---|---|---|---|---|
| **Cloudflare R2** | 10 GB-month, 1 M writes + 10 M reads / month | ≈ US$0.015 / GB-month | **free** | ✅ primary for PDFs + new audio. Allowance is **shared with the other R2 project**; beyond it ≈ US$0.015 / GB-month (≈ US$0.35 / month at ≈ 33 GB if the other project is empty) |
| Backblaze B2 | 10 GB | ≈ US$0.006 / GB-month | free when fronted by Cloudflare | ✅ second copy (backup) |
| archive.org | unlimited (non-profit) | — | free | ✅ keep as fallback; no SLA, don't rely on it alone |
| GitHub repo / Pages / LFS | 1 GB soft limit | — | — | ❌ not for media |
| Workers static assets | — | — | — | ❌ 25 MiB per file |
| Oracle Cloud "Always Free" VM | 200 GB disk, big egress | — | — | ⚠️ works, but we'd run a server (ops burden) |

**Recommendation.** R2 as primary (`media.drwasiullah.com`), archive.org as automatic fallback in the player,
monthly sync of R2 → B2 (or an external drive) as backup. Expected cost: **≈ US$0.06/month after Phase 2 and ≈ US$0.35/month at completion** (the free 10 GB covers most of Phase 2),
zero egress surprises even if a lesson goes viral.

**Uniform audio spec (for new/converted audio):** mono · AAC-LC **48 kbps** · 44.1 kHz · `.m4a` with `+faststart`
(plays on every iPhone/Android/desktop; Opus-in-WebM does not play on older iOS) · loudness-normalised to
**−16 LUFS** (EBU R128) so every lesson plays at the same volume · ID3/MP4 tags (title, series, track no.). ≈ 21.6 MB per hour.

## 4. Phases

| Phase | Theme | Effort | Depends on |
|---|---|---|---|
| **0** | Foundations: decisions, hygiene, backups, security basics | S | — |
| **1** | **Findable & trustworthy**: real URLs + SEO, Search Console, bio page, accessibility & security quick wins | L | bio text/photo from the team |
| **2** | **Own the data**, step 1: PDFs on R2 (+ optional mirror of the existing audio) | M | D1, D8 |
| **3** | **Auto-update**: YouTube daily sync (3a) · Mixlr live + recordings (3b) | M | 3b needs the Mixlr owner |
| **4** | **Audio for the video lessons** — supplied by the Sheikh's team, normalised to one spec (+ optional re-encode of existing audio) | L | D1, team delivery |
| **5** | **English edition** | L | D5, Phase 1 |
| ∞ | Backlog (podcast RSS, transcripts, offline, …) | — | |

Indicative calendar: Ph0 wk 1 · Ph1 wk 2–5 · Ph2 wk 5–7 · Ph3 wk 7–9 · Ph4 wk 9–13 · Ph5 wk 13–17. Accessibility and
security checks run continuously (they are part of every phase's "done").

### Phase 0 — Foundations (S)
- [ ] Merge the working branch into `main`; Cloudflare deploys from `main`. Delete `wasiwordpress.rar` (keep a private copy). Delete the old Netlify site in its dashboard.
- [x] `netlify.toml` and the GitHub Pages workflow removed (Cloudflare only); `DEPLOY.md` rewritten for Cloudflare + the Namecheap domain.
- [x] **Input sanitisation** (search boxes, URL parameters, data URLs) + `tests/xss_check.mjs`; CSP shipped in **report-only** mode (see §5.2).
- [x] Run `tools/measure_storage.py` (done, §3). Result: **30 Bukhari lessons are HTTP 404 at the source** (`wasi007`–`wasi036`, the whole «كتاب الصلاة» part — only the 6 «كتاب العلم» files exist) and 1 PDF returns HTTP 500 (probably the 357 MB «المسجد الحرام»).
- [x] Hide dead links: pruned 30 dead Bukhari URLs (`dead_links.txt`); series retitled «دروس من صحيح البخاري — كتاب العلم» (6 lessons) — restore «كتابا العلم والصلاة» in `import_wordpress.py` once the prayer lessons are recovered. Ask the archive.org/WordPress owner to re-upload the Bukhari prayer lessons (then delete their lines from `dead_links.txt`). Re-check the PDF later (`measure_storage.py` retries failures).
- [ ] Accounts: **2-factor authentication** on GitHub, Cloudflare, Namecheap; registrar lock on; auto-renew on; WHOIS privacy on.
- [ ] Cloudflare: Always-HTTPS, HSTS (start 6 months, no preload yet), DNSSEC on (then add the DS record at Namecheap), CAA record, free **Web Analytics** (cookie-less).
- [ ] GitHub: branch protection on `main` (PR required), secret scanning + Dependabot (Actions) on.
- [ ] Add `CLAUDE.md` (done) and keep it current.

### Phase 1 — Findable & trustworthy (L)
**1a. Real URLs + pre-rendering (the SEO foundation)**
- New build step `build_site.py` (Python, no framework) that writes static HTML per page: `/`, `/section/<id>/`, `/series/<id>/`, `/lesson/<id>/`, `/books/`, `/about/`, `/search/`. Each page contains the real content (titles, lists, player markup) so it works without JS and is indexable; the existing JS enhances it (History API instead of `#`).
- Slugs: ASCII ids (`/series/sahih-muslim/`) with the Arabic title in `<title>`/`<h1>` (Arabic URLs get percent-encoded when shared).
- Per page: unique `<title>` (≤ 60 chars), meta description, canonical, Open Graph / Twitter card, `lang`/`dir`; apex ↔ www redirect (done in Cloudflare).
- **Structured data (JSON-LD):** `Person` (Sheikh) · `WebSite` + `SearchAction` · `BreadcrumbList` · lesson pages `AudioObject` / `VideoObject` (name, uploadDate, duration, contentUrl/embedUrl) · series `ItemList`.
- `sitemap.xml` (index → pages / lessons, with `<lastmod>`), `robots.txt`, `humans.txt` optional; IndexNow ping on each deploy.
- Thin-content mitigation: lesson pages carry series context, date, book/chapter, prev/next, "other lessons in this series", and the video description when we have one (`videos.db` already stores it). Transcripts are the real fix → backlog.
- Redirect old `/#/…` links client-side to the new URLs (keeps shared links alive).

**1b. Search Console**
- Add a **Domain property** `drwasiullah.com` (verify with a DNS TXT record in Cloudflare — we don't need to touch the site), submit `sitemap.xml`, request indexing of home + key series, monitor *Pages* (coverage), *Core Web Vitals*, *Queries*. Do the same in **Bing Webmaster Tools** (import from GSC).
- Targets: all sitemap URLs "Submitted and indexed" within ~4–6 weeks; Lighthouse SEO ≥ 95; LCP < 2.5 s on mobile 4G (fonts are 300 KB self-hosted — preload only the display font, `font-display: swap`, subset if needed).

**1c. Bio — "عن الشيخ"** (needs D2)
- Page `/about/` (nav item «الشيخ»), a short teaser card on the home page right under the hero (photo, 3 lines, "اقرأ المزيد"), link in footer and drawer; `Person` JSON-LD; link to his books (`/books/`). Content strictly from owner-provided/approved sources, with the source noted in the repo. English version in Phase 5.

**1d. Accessibility baseline (WCAG 2.2 AA)** — see §5.1 for the checklist.
**1e. Security baseline** — CSP and headers, see §5.2.

### Phase 2 — Own the data, step 1 (M)  *(needs D1 for mirroring, D8 to size 2b)*
The existing audio already sits on archive.org (free, stable); the fragile part is the **PDFs on a WordPress.com blog**. So:
- **2a — PDFs → R2 (always):** ≈ 0.55 GB, fits any allowance. Bucket `drwasiullah-media` (separate bucket, same account) with custom domain **`media.drwasiullah.com`** (public read, `Cache-Control: public, max-age=31536000, immutable`, CORS for range requests); write access only through a scoped API token held as a GitHub secret.
- **2b — existing audio → R2 (optional, decide after D8):** ≈ 13.2 GB. Cost is cents (§3) but it uses the shared allowance. If we skip it, archive.org remains the host and nothing is lost except independence from a third party. A cheap middle path: mirror only the series people use most.
- `tools/mirror_media.py` (resumable; verifies size + SHA-256; S3 API / `rclone`): downloads from the source and uploads to `audio/<series>/<lesson-id>.<ext>` and `pdf/<book-id>/<file>.pdf`; writes `media-manifest.json` (bytes, sha256, source URL, duration, date, permission note).
- `ffprobe` every audio file → fill the missing `duration` fields (brings back an honest "hours" statistic).
- `library.json` gets `src` (primary) **and** `src_alt` (the other copy); the player tries `src` and falls back to `src_alt` on error (it already shows a message when a file fails). Books get the same.
- Backup: monthly sync of R2 → Backblaze B2 (own 10 GB free) or an external drive (`rclone sync`), script in `tools/`.
- **Done when:** every PDF resolves from `media.drwasiullah.com`; (if 2b) manifest shows 100 % sha match and the site plays everything with WordPress blocked.

### Phase 3 — Auto-update (M)
**3a. YouTube sync (GitHub Actions, daily + manual)**
- Workflow: `ingest` (API key from a repo secret; restrict the key to *YouTube Data API v3*) → `build_catalogue` → build site → commit only if the data changed → push to `main` → Cloudflare auto-deploys → IndexNow ping.
- **Incremental**: page through the uploads playlist newest-first and stop at the first known video id (≈ 2–3 API units/day of the 10,000 daily quota).
- Review queue: new videos that match the Sheikh's name are published automatically; unmatched ones (other speakers) are **not** — they open/append a GitHub Issue "Review new videos" with links, and `manage.py approve|reject` records the decision. A failed run also opens an Issue.
- Replace the committed binary `videos.db` with a diff-friendly text store (`data/videos.jsonl`) so daily commits don't bloat the repo (keep `videos.db` as a local cache).
**3b. Mixlr (needs the Mixlr owner; start with a 1-session spike)**
- *Unknown until investigated* (Mixlr's API access/terms can't be checked from our build environment): (1) is there an official API / RSS for a channel's past broadcasts? (2) are recordings downloadable by the owner? (3) live status endpoint?
- Planned outputs, in order of value: **«مباشر» (Live) page + home banner** showing live state via a tiny Cloudflare Worker proxy (cache ≤ 30 s, fails closed so Mixlr downtime never breaks the site) with the official Mixlr embed player; then **recordings ingest** → audio spec of §3 → R2 → `library.json` (under a "المجالس المباشرة" series) via the same Action.
- Fallback if no API: owner exports/uploads recordings to a shared folder; a script ingests that folder.

### Phase 4 — Audio for the video lessons, supplied by the Sheikh's team, made uniform (L)  *(decision D1)*
No YouTube downloading: the Sheikh's team provides the audio (better quality, no terms-of-service or permission issue).
- **Delivery spec for the team:** `docs/audio-delivery-spec.md` (Arabic) — one file per lesson, any normal format (mp3/m4a/wav/flac), **filename = the YouTube video ID** (e.g. `BHlv9TkmsME.mp3`) or a CSV that maps files to lessons, no re-encoding before sending, shared via a download link. Backlog first (944 lessons, 857 h), then a regular drop for new lessons.
- `tools/ingest_audio.py` *(to build when the first batch arrives)*: matches each file to a lesson (video ID / CSV), `ffprobe` → duration, `ffmpeg` → **mono, loudnorm −16 LUFS, AAC-LC 48 kbps, `+faststart`, tags (title, series, track no.)**, uploads to storage, sets `audio` (and duration) on the lesson, reports files that matched nothing and lessons still without audio. Runs on any machine with ffmpeg; no cloud service needed.
- UI: every video lesson page gets a **«استماع فقط» (Audio only)** toggle (data saver on mobile — a real benefit on metered plans); audio players keep speed control and auto-next.
- Size: ≈ 18.5 GB at 48 kbps for the 857 h backlog (§3) — this is where the shared R2 allowance is exceeded; budget ≈ US$0.15–0.35 / month. If the team's originals are already ≈ 48 kbps mono we can store them as-is.
- Optional 4b: re-encode the existing archive.org audio to the same spec for uniform loudness/format (keep originals; A/B-test 5 files first).
- **Done when:** all video lessons with supplied audio have an audio twin at the uniform spec; loudness within ±1 LU across a random sample; lessons without audio are listed for the team.

### Phase 5 — English edition (L)  *(needs D5)*
- Architecture: UI strings in `i18n/ar.json`, `i18n/en.json`; pages generated at `/en/…` (LTR) alongside the Arabic ones; `hreflang` pairs + `x-default`; language switcher (remembers choice); CSS already uses logical properties (`inset-inline`, `margin-inline`), so mirroring is mostly icon directions and the bookshelf's vertical spine text.
- Content: translate UI + section/series/book names (curated `titles_en` table, owner-reviewed; transliteration policy: *Sheikh Wasiullah ibn Muhammad Abbas, may Allah preserve him*); lesson titles stay Arabic (shown with an English series context) — machine-translating religious titles is **not** done without review.
- Typography: add a Latin serif that matches the manuscript look (self-hosted), numerals Western in English.
- English bio (Phase 1c text), English meta/OG/JSON-LD, English keywords (e.g. "Sahih Muslim explanation audio").

### Backlog (value order, not scheduled)
Podcast RSS per series (Apple/Spotify reach — needs D1) · WhatsApp share button on every lesson (the audience's main channel) · remember playback position / favourites (localStorage) · **auto-transcripts** (Whisper) → searchable text + captions: the largest SEO and accessibility win, but compute/time-costly and needs scholar review for accuracy · PWA/offline downloads · "related lessons" · per-series Open Graph images · print-friendly book pages · uptime monitor (free).

## 5. Cross-cutting checklists

### 5.1 Accessibility (WCAG 2.2 AA, Arabic screen readers)
- **Route changes:** update `document.title`, move focus to the page `<h1>` (`tabindex="-1"`), announce via one polite live region; remove `aria-live` from `<main>` (it re-reads whole pages).
- **Landmarks/headings:** keep `header/nav/main/footer`, one `<h1>`, ordered `h2/h3`; label each `<nav>`; `aria-current="page"` on the active item (header, drawer, bottom bar).
- **Drawer:** `role="dialog" aria-modal="true"`, focus trap, `inert` on the rest of the page, Esc closes (done), focus returns to the trigger (done).
- **Contrast audit:** gold text (`#a8791c` on parchment) and `--ink-2` small text are borderline/failing 4.5:1 — adjust tokens; re-check dark theme and the red-on-parchment tags.
- **Targets:** ≥ 44 × 44 px (icon buttons are 40; pills ~28 px high); visible `:focus-visible` ring (done) in both themes.
- **Audio player:** native `<audio controls>` (accessible); speed buttons → `aria-pressed`; announce "next lesson" on auto-advance; document keyboard use (Space, ←/→).
- **Language:** `lang="ur"` on Urdu titles, `lang="en"` on English strings, bidi-isolate mixed text; book covers `alt` = title; decorative icons `aria-hidden` (done), spines get a proper accessible name (title + count).
- **Preferences:** `prefers-reduced-motion` (done), add `prefers-contrast` and `forced-colors`; reflow at 320 px and 200 % zoom.
- **Testing in CI:** axe-core via Playwright on 10 key pages + Lighthouse CI (fail below 95). **Manual pass before each release:** NVDA + Firefox, VoiceOver (iOS & macOS), TalkBack with Arabic voice; keyboard-only run. Publish a short accessibility statement + contact for feedback.
- **Stretch:** transcripts/captions (backlog).

### 5.2 Security
- **Response headers** (`site/_headers`): strict **CSP** (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` — inline `style=` attributes are used for CSS variables, accepted risk; `img-src 'self' https://i.ytimg.com data:`; `media-src 'self' https://media.drwasiullah.com https://archive.org https://*.archive.org`; `frame-src https://www.youtube-nocookie.com`; `font-src 'self'`; `connect-src 'self'`; `frame-ancestors 'none'`; `base-uri 'none'`; `form-action 'none'`), `Strict-Transport-Security`, `Permissions-Policy` (deny camera/mic/geo), keep `X-Content-Type-Options` and `Referrer-Policy`. **Shipped in report-only mode** (`site/_headers`, plus HSTS 180 days and Permissions-Policy). Tested locally in *enforce* mode on 18 page loads with zero violations and a deliberate injected script blocked. Before switching to enforce: open the live site with devtools → Console, play one audio and one video lesson, and confirm no "[Report Only] … violates" messages (the archive.org / YouTube hosts can't be tested from our build environment).
- **Input sanitisation — DONE (Oct 2026):** search text is length-capped (100 chars / 8 words), stripped of control and bidi-override characters (`cleanQuery`); URL parameters are whitelisted (`sec`, `sort`); malformed `%`-sequences no longer crash routing; lookup tables have no prototype (`#/watch/__proto__` was a crash); every URL taken from data must be `https:` (`safeUrl`) and YouTube ids exactly 11 chars; `tests/xss_check.mjs` throws 19 hostile inputs (XSS, oversize, NUL/ESC, RLO, `__proto__`, malformed URIs) at every entry point.
- **XSS discipline:** all third-party text (YouTube titles/descriptions, Mixlr, WordPress) is untrusted — it already goes through `esc()` before `innerHTML`; keep it that way and add a unit test that feeds `<img onerror>` payloads through every render path. Pre-rendered pages must escape too.
- **No third-party scripts** (fonts and icons are self-hosted) — keep it that way; add `Subresource Integrity` if one is ever added.
- **Secrets:** API keys only in GitHub/Cloudflare secrets, never in the repo (history scan: clean); restrict the YouTube key to the one API; R2 token scoped to one bucket, write-only in CI.
- **Supply chain:** pin GitHub Actions by commit SHA, Dependabot for Actions and `requirements.txt`, no runtime npm dependencies.
- **Account/domain:** 2FA everywhere, registrar lock, DNSSEC, CAA; email auth (SPF/DKIM/DMARC `p=quarantine`) if/when mail is used on the domain.
- **Media:** hotlink protection (Cloudflare WAF rule on `Referer`) and rate limiting on `media.` ; no listing; backups per 3-2-1 (R2 + B2/external + git).
- **Privacy:** no cookies, no tracking beyond cookie-less Cloudflare Web Analytics; privacy note in footer.

## 6. Risks
| Risk | Mitigation |
|---|---|
| Rights/permission for mirroring or extracting audio | D1 in writing before Phases 2/4; keep archive.org/YouTube links as the default until then |
| Team delivers audio slowly / inconsistently | Spec + CSV mapping, backlog by series (most-used first); videos keep working without audio twins |
| Mixlr offers no API | Spike first; fall back to owner-supplied recordings + embed-only live page |
| SEO: thin, near-duplicate lesson pages | Real series/book context, descriptions, internal links; transcripts later; don't submit low-value URLs |
| Free-tier terms change | Everything is plain files + a manifest → portable to B2/S3/any host in a day |
| Single maintainer / bus factor | `CLAUDE.md` + `README.md` + `DEPLOY.md` kept current; data regenerable from scripts |

## 7. Open questions
1. How much R2 storage does the other project use today (D8)?
2. Is the Sheikh's Mixlr channel public, and who can log in to it?
3. English: Hijri only, or Hijri + Gregorian? Name transliteration preference?
4. Budget ceiling (D3) — is up to ≈ US$1/month for storage acceptable?
