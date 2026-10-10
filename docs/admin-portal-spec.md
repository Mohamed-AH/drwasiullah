# Admin portal — plan (v1, agreed in principle 2026-10-10; no code written yet)

Goal: let the team add and manage content without touching git. Top priority: **upload new lectures into an existing audio series**.

## 1. Decisions taken
| Topic | Decision |
|---|---|
| Public site | Stays **static, pre-rendered** (fast, SEO, works if the DB or portal is down). D1 is the **source of truth**; publishing rebuilds the site. |
| Urgent items | Banner, announcements, today's schedule/cancellation come from a tiny **cached live endpoint** (≈1 min), no rebuild. |
| Database | Cloudflare **D1** (free tier). Nightly JSON export committed to git = backup + audit trail. |
| Auth | **Cloudflare Access** in front of `admin.drwasiullah.com`: Google login **and** email one-time code. Role looked up in a `users` table by the verified email. |
| Roles | **Admin**: everything. **Editor**: upload/edit audio, books, links; hide/show; **may Publish**. Admin-only: delete, users, home layout, schedule, banners/announcements, settings, analytics, reports. |
| Workers | Public Worker (read-only D1) and **separate admin Worker** (read/write). One repo (`admin/` folder). |
| Uploads | Browser → R2 **directly** (signed multipart). `.mp3`/`.m4a`, soft warning above 100 MB, warn if not mono. Duration read in the browser. Normalisation (mono/−16 LUFS/AAC 48 kbps) stays an offline script, not in the portal. |
| Language | Admin UI in Arabic (RTL), Hijri dates only. |
| Text safety | Banners/announcements are plain text + https links. No HTML. Existing `esc()`/`safeUrl()` rules apply. |

## 2. Publish flow (proposal)
Editor presses **نشر** → admin Worker calls GitHub `workflow_dispatch` (token limited to Actions on this repo) → Action exports D1 into the site's data files, commits to `main` → Cloudflare builds and deploys exactly as today. Same pattern as `youtube-sync.yml` (use a shared concurrency group so the two never collide). No D1 token is needed in the Cloudflare build. Every publish is a commit = free history.

## 3. Data model (outline; exact columns derived from `docs/data-formats.md` in phase 1)
`series`, `lessons` (kind audio/video/book-part, `n` + optional part suffix, Hijri date, source: R2 key or external URL + optional `src_alt`, duration, size), `books` + `book_files`, `sections`, `pages`, `home_blocks` (type, order, visible, config), `schedule_slots`, `banners` (text, link, start/end), `announcements`, `users` (email, role), `audit_log` (who, what, before/after), `stats_daily` (item, day, plays, views), `settings`.
Every content row has `status`: draft / published / hidden. Unique `(series, n)` guard.

## 4. Audio upload screen (priority workflow)
1. Choose series → next number and title pattern pre-filled.
2. Drop one or many files → auto-ordered by file name, drag to reorder; per row: number, title (editable), Hijri date (default today), duration/size auto.
3. Upload with per-file progress and resume. Save as draft or **Publish**.
Rules: duplicate-number warning, part suffixes (22a/22b), phone-friendly, re-uploading the same file is harmless (content-addressed keys).

## 5. Analytics
Daily counters per item (not one row per event); no cookies, no personal data, no third parties. A play counts after ≈30 s. Collection starts in phase 3 (history can't be back-filled). Dashboard: top lessons, trend, per-series totals.

## 6. Phases and acceptance
1. **Foundations** — D1, Access, schema, migration script, build-from-D1. *Accept:* 3,298 lessons / 29 series / 24 books; site built from D1 matches the current site; e2e/xss/a11y tests pass; nightly backup works. Visitors see no change.
2. **Admin shell** — login, roles, audit log, read-only browse.
3. **Audio upload workflow** + analytics beacon + Publish.
4. **Editing & visibility** — edit/hide items, books, standalone audio, YouTube links; YouTube sync writes to D1.
5. **Live layer** — banners, announcements, schedule.
6. **Home layout manager** (fixed block palette, not a page builder).
7. **Analytics dashboard.**
8. **Reports** — printable HTML + CSV from D1 (same logic as `scripts/make_report.mjs`).

Old JSON importers stay as fallback until parity is proven, then retire.

## 7. Owner setup (when phase 1 starts)
Create D1 database; enable Zero Trust (free) and an Access application for `admin.drwasiullah.com` (Google + email OTP); add DNS for the subdomain; create the GitHub fine-grained token (Actions: write, this repo only) and store it as a Worker secret; create an R2 API token scoped to `drwasiullah-media` for signed uploads. Check whether Zero Trust signup asks for a card, and re-check the free-tier limits then (D1 5 GB / 5M reads / 100k writes per day; Workers 100k requests/day; Access 50 users — quoted from memory).

## 8. Still open
- Approval queue is **not** used (Editors publish); revisit if mistakes become frequent.
- Whether Mixlr "live now" detection is added to the live layer.
- English edition: how titles are translated (affects schema: translated title columns).
