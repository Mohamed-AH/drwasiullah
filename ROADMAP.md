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
4. **Storage is a small money problem, not a big one** (≈ US$0–1 / month, see §3) because Cloudflare R2 has no egress fee.
5. **Rights, not technology, are the gating risk** for mirroring audio and for converting YouTube to audio
   (YouTube's terms forbid downloading content you don't own). Written permission comes first (§2).
6. A few hygiene items found while auditing: stray files were committed (`__pycache__`, an `unrar` wheel — removed in this
   change); `videos.db` is a binary committed to git (will bloat once a bot commits to it daily); `wasiwordpress.rar`
   (4.5 MB) is no longer needed; three hosts (Netlify, GitHub Pages workflow, Cloudflare) are configured — keep one.
   Good news: a history scan found **no API key** ever committed.

## 2. Decisions needed from the owner (blocking)

| # | Decision | Needed for |
|---|---|---|
| D1 | **Written permission** from the Sheikh and the YouTube channel owner (Wahat al-Sunnah) to (a) mirror existing audio/PDFs on our own storage, (b) extract audio from the YouTube videos, (c) publish a podcast feed. Who owns the **Mixlr** account? | Phases 2, 4, 3b |
| D2 | **Bio text + photo**: provide or approve the Arabic bio (and English) from the Sheikh's own/official sources. We will not write biographical claims from memory. | Phase 1 |
| D3 | **Budget ceiling** (suggest ≤ US$5/month on top of the domain). | Phase 2, 4 |
| D4 | **Keep archive.org as a permanent fallback** after mirroring? (recommended: yes) | Phase 2 |
| D5 | English edition scope: UI only, or also translated series/book titles? Show Hijri only, or Hijri + Gregorian in English? | Phase 5 |
| D6 | Repo **public or private**? (public ⇒ unlimited free GitHub Actions minutes; private ⇒ 2,000 min/month) | Phase 3 |
| D7 | Keep **Cloudflare** as the only host; delete the Netlify site and the GitHub Pages workflow. | Phase 0 |

## 3. Storage assessment

**Method.** Hours × bitrate. Real file sizes for the existing audio can't be read from our build environment
(archive.org is blocked there), so `tools/measure_storage.py` does it on any normal machine:
`python tools/measure_storage.py` (HEAD requests only, nothing is downloaded, resumable, ~1,100 requests).
**Run it and paste the output into this file — it replaces the estimates below.**

| Bucket | Files | Size | Basis |
|---|---|---|---|
| PDFs (books, incl. one 357 MB scan) | 29 | **≈ 0.6–1.5 GB** | estimate; measure |
| Existing audio on archive.org | 1,066 | **≈ 15–40 GB** | unmeasured (bitrates unknown, likely 32–64 kbps mono/stereo) |
| YouTube → audio, backlog | 944 (857 h) | **12.3 GB @32k · 18.5 GB @48k · 24.7 GB @64k** | 857 h × bitrate (mono) |
| YouTube → audio, ongoing | ~220 videos / yr | **≈ 4 GB / yr @48k** | last 12 months: 219 videos, 179 h |
| Podcast/other copies, thumbnails, JSON | — | < 0.5 GB | |
| **Total at completion** | | **≈ 35–65 GB** (recommended 48 kbps AAC) | + ~4 GB / yr |

**Free-tier options**

| Option | Free | Beyond free | Egress | Verdict |
|---|---|---|---|---|
| **Cloudflare R2** | 10 GB-month, 1 M writes + 10 M reads / month | ≈ US$0.015 / GB-month | **free** | ✅ primary. 50 GB ≈ **US$0.60 / month**; 65 GB ≈ US$0.83 |
| Backblaze B2 | 10 GB | ≈ US$0.006 / GB-month | free when fronted by Cloudflare | ✅ second copy (backup) |
| archive.org | unlimited (non-profit) | — | free | ✅ keep as fallback; no SLA, don't rely on it alone |
| GitHub repo / Pages / LFS | 1 GB soft limit | — | — | ❌ not for media |
| Workers static assets | — | — | — | ❌ 25 MiB per file |
| Oracle Cloud "Always Free" VM | 200 GB disk, big egress | — | — | ⚠️ works, but we'd run a server (ops burden) |

**Recommendation.** R2 as primary (`media.drwasiullah.com`), archive.org as automatic fallback in the player,
monthly sync of R2 → B2 (or an external drive) as backup. Expected cost: **under US$1/month**, zero egress surprises
even if a lesson goes viral. The 10 GB free tier alone covers PDFs + the first ~half of the audio.

**Uniform audio spec (for new/converted audio):** mono · AAC-LC **48 kbps** · 44.1 kHz · `.m4a` with `+faststart`
(plays on every iPhone/Android/desktop; Opus-in-WebM does not play on older iOS) · loudness-normalised to
**−16 LUFS** (EBU R128) so every lesson plays at the same volume · ID3/MP4 tags (title, series, track no.). ≈ 21.6 MB per hour.

## 4. Phases

| Phase | Theme | Effort | Depends on |
|---|---|---|---|
| **0** | Foundations: decisions, hygiene, backups, security basics | S | — |
| **1** | **Findable & trustworthy**: real URLs + SEO, Search Console, bio page, accessibility & security quick wins | L | D2 |
| **2** | **Own the data**, step 1: PDFs + existing audio on R2 | M | D1, D3, measure |
| **3** | **Auto-update**: YouTube daily sync (3a) · Mixlr live + recordings (3b) | M | D6; 3b needs Mixlr owner |
| **4** | **YouTube → uniform audio** (and optional re-encode of existing audio) | L | D1, Phase 2 |
| **5** | **English edition** | L | D5, Phase 1 |
| ∞ | Backlog (podcast RSS, transcripts, offline, …) | — | |

Indicative calendar: Ph0 wk 1 · Ph1 wk 2–5 · Ph2 wk 5–7 · Ph3 wk 7–9 · Ph4 wk 9–13 · Ph5 wk 13–17. Accessibility and
security checks run continuously (they are part of every phase's "done").

### Phase 0 — Foundations (S)
- [ ] Merge the working branch into `main`; Cloudflare deploys from `main`. Delete `netlify.toml` and `.github/workflows/pages.yml` if D7 = Cloudflare only; delete `wasiwordpress.rar` (keep a private copy).
- [ ] Run `tools/measure_storage.py`; paste results into §3.
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

### Phase 2 — Own the data, step 1: PDFs + existing audio (M)  *(needs D1, D3)*
- Create R2 bucket `drwasiullah-media` + custom domain **`media.drwasiullah.com`** (public read, `Cache-Control: public, max-age=31536000, immutable`, CORS for range requests); write access only through a scoped API token stored as a GitHub/CI secret.
- `tools/mirror_media.py` (resumable; verifies size + SHA-256; uses the S3 API / `rclone`): downloads each file from archive.org / wordpress.com and uploads to `audio/<series>/<lesson-id>.<ext>` and `pdf/<book-id>/<file>.pdf`. Writes `media-manifest.json` (bytes, sha256, source URL, duration, date mirrored, permission note).
- `ffprobe` every audio file → fill the missing `duration` fields (also lets us bring back the "hours" statistic honestly).
- `library.json` gets `src` (R2) **and** `src_alt` (original); the player tries `src`, falls back to `src_alt` on error. Books get the same.
- Order: PDFs first (tiny, fits the free tier) → audio series by size.
- Backup: monthly R2 → B2/external drive sync (`rclone sync`), script in `tools/`.
- **Done when:** every media URL in `library.json` resolves from `media.drwasiullah.com`; manifest shows 100 % sha match; site still plays everything with WordPress and archive.org blocked (test with hosts blocked).

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

### Phase 4 — YouTube → uniform audio (L)  *(gate: D1 in writing)*
- `tools/video_to_audio.py`: `yt-dlp -f ba` → `ffmpeg` mono, `loudnorm` (−16 LUFS, TP −1.5), AAC-LC 48 kbps, `+faststart`, tags (title, album = series, track = lesson no.) → upload to R2 → set `audio` on the lesson in the catalogue.
- **Where it runs:** the 857 h backlog (≈ 20–40 GB download of audio-only streams, a few hours of CPU) runs **once on the owner's/our own machine** — YouTube often blocks data-centre IPs (GitHub Actions) with bot checks, so don't plan on Actions for this. Incremental new uploads: same script on a small always-on machine, or Actions if it works, plus the Mixlr/owner-provided originals (better quality) whenever available. Preferred: **ask the channel owner for the original recordings** instead of re-downloading from YouTube.
- UI: every video lesson page gets a **«استماع فقط» (Audio only)** toggle (data saver on mobile — a real benefit for students on metered plans); audio players keep speed control and auto-next.
- Optional 4b: re-encode the existing archive.org audio to the same spec for uniform loudness/format (keep originals as backup; lossy→lossy at ≥ 48 kbps is acceptable for speech, A/B-test 5 files first).
- **Done when:** all video lessons have an audio twin at the uniform spec; loudness within ±1 LU across a random sample; storage matches §3.

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
- **Response headers** (`site/_headers`): strict **CSP** (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` — inline `style=` attributes are used for CSS variables, accepted risk; `img-src 'self' https://i.ytimg.com data:`; `media-src 'self' https://media.drwasiullah.com https://archive.org https://*.archive.org`; `frame-src https://www.youtube-nocookie.com`; `font-src 'self'`; `connect-src 'self'`; `frame-ancestors 'none'`; `base-uri 'none'`; `form-action 'none'`), `Strict-Transport-Security`, `Permissions-Policy` (deny camera/mic/geo), keep `X-Content-Type-Options` and `Referrer-Policy`. Ship in report-only first, then enforce.
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
| YouTube blocks the audio download from servers | Run locally; prefer originals from the channel owner; metadata sync (Phase 3a) doesn't need downloads |
| Mixlr offers no API | Spike first; fall back to owner-supplied recordings + embed-only live page |
| SEO: thin, near-duplicate lesson pages | Real series/book context, descriptions, internal links; transcripts later; don't submit low-value URLs |
| Free-tier terms change | Everything is plain files + a manifest → portable to B2/S3/any host in a day |
| Single maintainer / bus factor | `CLAUDE.md` + `README.md` + `DEPLOY.md` kept current; data regenerable from scripts |

## 7. Open questions
1. Is the Sheikh's Mixlr channel public, and who can log in to it?
2. Preferred bio sources and a photo that may be published?
3. Are there original (non-YouTube) recordings of the video lessons?
4. English: Hijri only, or Hijri + Gregorian? Name transliteration preference?
5. Public repo OK?
