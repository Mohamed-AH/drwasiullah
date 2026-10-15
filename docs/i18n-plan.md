# English and Urdu editions — plan (DRAFT v1, 2026-10-15, for owner review; no code written)

Goal: a carefully translated English edition and Urdu edition of the **public site**, chosen automatically from the visitor's device language, **without any risk to the live Arabic site**. Series, section and book titles are transliterated (curated by us and reviewed by a person). Nothing here touches the admin portal's own language (it stays Arabic).

---

## 0. What we measured (so the plan rests on facts)

| Fact | Value | Consequence |
|---|---|---|
| Fixed Arabic UI text in the code | ≈ 250 strings (≈ 3,900 characters: `views.js` 177 runs, `core.js` 65, `app.js` 17, `live.js` 8, `shell.html` 1, `worker` 1) | Small enough to translate carefully and have a native reader review every string |
| Series / sections / books | 30 series · 128 distinct section names (الباب) · 24 books in 3 groups · 3 unit words | A **curated glossary** covers all structured titles (~190 entries) |
| Lesson titles | 3,299 lessons, 3,017 distinct titles, avg 41 characters. Most are *templates*: unit + number + series name + section + «الجزء الأول». The rest is free text (Fath al-Bari chapter headings «باب …», YouTube titles) | Translate the **structure** from our glossary; keep free classical text in Arabic script until a person transliterates it (§3.3) |
| Pages | 3,369 files today → ≈ 10,100 with three languages | Under Cloudflare's 20,000-file limit with headroom for ~6,000 lessons; build time ~15 s → ~45 s |
| CSS | Already almost fully logical (`inset-inline`, `margin-inline`…): only ~8 physical left/right rules | Flipping to LTR is a small, testable change |
| Existing fonts | Aref Ruqaa, Noto Naskh, Reem Kufi already contain every Urdu letter (checked with fonttools; only «ۃ» is missing in Ruqaa) | Urdu works even before new fonts; new fonts are a quality upgrade, not a necessity |
| Hijri in other languages | `Intl` gives Hijri for `en` and `ur`, but month spellings vary between browsers/ICU versions | We keep **our own month-name tables** (like `make_report.mjs`) so Node (build) and the browser always agree |

## 1. Principles — the guarantees that protect production

1. **Arabic never changes.** Arabic URLs, HTML, behaviour and the daily sync stay as they are. Arabic remains at `/…`; new languages live under `/en/…` and `/ur/…`.
2. **Refactor first, translate later.** Step 1 only moves Arabic strings into a dictionary and proves the generated Arabic site is **byte-identical** to today's (golden hash of all ~3,300 pages). Only then do we add languages.
3. **Feature flag.** A build setting `LANGS` (default `ar`) decides what is generated. Merging code does not change the live site until the flag is flipped in its own small change; reverting that one change brings back today's site.
4. **Soft launch.** EN/UR first go out `noindex`, out of the sitemap, with the switcher hidden, reachable only by direct link for reviewers. Then index + switcher in a second step.
5. **Honest fallbacks.** If a translation is missing, show the Arabic original (marked `lang="ar"`), never a machine guess. The portal's quality report lists what is missing.
6. **No invented scholarship.** UI wording is ours (reviewed). Titles are transliterated, not re-interpreted. The bio and the official name/role wording in EN/UR need the team's written approval (existing content-integrity rule); until then those pages show Arabic with a short note.
7. **Everything measured.** New tests per language (completeness, RTL/LTR, axe, hreflang symmetry, links, fonts), plus performance budgets.

## 2. URLs, routing, SEO

- **Structure:** `/en/`, `/en/series/<id>/`, `/en/lesson/<id>/` … and `/ur/…`, mirroring the Arabic paths. IDs stay ASCII and identical across languages. Existing Arabic URLs and `_redirects` untouched.
- **Every page** gets `<link rel="alternate" hreflang="ar|en|ur|x-default">` (x-default = Arabic), self-referencing canonical, `<html lang dir>`, `og:locale` (`ar_AR`/`en_US`/`ur_PK`), localized `<title>`/description/JSON-LD (`inLanguage`).
- **Sitemap:** one sitemap with `xhtml:link` alternates for each URL (still a single file well under 50,000 URLs: ~10,100).
- **404:** one trilingual page (Cloudflare serves a single `404.html`).
- **Search results page** (`/en/search/`) stays `noindex` like today's.
- Old `#/…` links keep redirecting to Arabic paths.
- **Why prefixes, not subdomains/query strings:** same domain authority, simple static hosting, trivially reversible.

## 3. Content: what gets translated and how

### 3.1 UI text (~250 strings)
`t("key", params)` dictionaries: `ar` (source of truth, bundled), `en`, `ur` (loaded only on those pages). Plurals and counts per language (Arabic dual/plural rules remain as is). Drafted by us from a **glossary of fixed terms** (e.g. Shaykh, Sharḥ, Majlis, Ḥadīth, Khuṭbah, ʿAqīdah, Kitāb/Bāb) agreed once, so every page uses the same spelling. A reviewer sees a sheet: key · Arabic · English · Urdu, and approves or corrects.

### 3.2 Names and transliteration style
- English transliteration standard: **simplified ALA-LC** (ā ī ū, ḥ ṣ ḍ ṭ ẓ, ʿ ʾ; no dots on ḏ ṯ ḫ in running titles unless wanted) — one style sheet, applied everywhere.
- Sheikh's name: «الشيخ وصي الله بن محمد عباس حفظه الله» → EN *Shaykh Wasiullāh ibn Muḥammad ʿAbbās, may Allah preserve him* · UR «شیخ وصی اللہ بن محمد عباس حفظہ اللہ». **Needs the owner's choice of spelling** (§11) and the team's approval for the official-site wording.
- The **basmala stays Arabic calligraphy (Aref Ruqaa) in all three languages**: it is sacred text and a brand element.

### 3.3 Titles — three tiers
| Tier | What | How | When |
|---|---|---|---|
| **1 — structured** | Series (30), sections (128), books (24, + groups), units, «الجزء الأول»… | Curated glossary files in git (`site/i18n/glossary.en.json`, `.ur.json`), reviewed once | Launch |
| **2 — composed lesson titles** | 3,299 lesson titles built from number + series + section + part | A **title composer** uses the lesson's own fields (n, series, section, part) and the glossary; free-text remainder stays Arabic in a `lang="ar"` span. A test reports coverage on all 3,299 titles | Launch |
| **3 — free text** | ~700 Fath al-Bari chapter headings, hadith ranges, YouTube free titles | Batches transliterated by us **with a reviewer**; until reviewed they show in Arabic script | After launch, ongoing |

For **Urdu**, readers read Arabic script, so Arabic-origin titles stay in Arabic script (Naskh) by default, with Urdu glossary entries for series/sections where an Urdu title is natural (the Urdu courses already have Urdu titles). Unvocalised Arabic → Latin by rule is unreliable («كتاب القصر» could be *qaṣr/qiṣar…*), which is why free text waits for a human.

### 3.4 Other content
- **Bio** (`/about/`): team-approved translation required (we can draft from the approved Arabic for the team to approve). Until approved: Arabic bio + a note.
- **Home blocks, headings, schedule, banners, announcements** (editor-entered text): later phase adds optional English/Urdu fields in the portal; until then they show Arabic. The public `/api/live` returns all languages and the page picks its own.
- **Dates and numbers:** Hijri only (owner rule) in every language. English: *9 Jumādā al-Ākhirah 1440 AH*, Western digits. Urdu: month names from our table (جمادی الثانی …); digit style is a decision (§11).
- **Search:** the normaliser gets Urdu forms (ی→ي، ک→ك، ہ/ھ→ه، ۃ→ة…) so Arabic and Urdu queries match each other; for English, each series/book gets Latin search keys from the glossary (diacritics, ʿ ʾ and «al-» ignored: "bukhari", "sahih muslim", "tirmidhi" all work).
- **Open Graph images** (share cards): Arabic card stays; EN/UR cards are a later, optional step.

## 4. Language choice (default = device language)

Rules, in order: (1) the URL's own language wins; (2) a saved choice (localStorage `lang`, no cookie) wins; (3) otherwise the browser's language list decides **only when someone enters through the home page**; (4) never for crawlers (user-agent check; hreflang does the indexing job); (5) deep links open in the page's language and show a small, dismissible banner in the visitor's language if another edition exists.
Risk to settle (see §11): many Arabic speakers use English phones, so auto-redirecting every `en` browser would send Arabic readers to English. Proposed default: **auto-switch only for Urdu** (a strong signal), **banner suggestion for English**. The switcher («عربي · English · اردو») is in the header, the drawer and the footer and always links to the same page in the other language. Implementation: a tiny first-party script (like `theme-init.js`), no server logic, nothing for Googlebot to be redirected by.

## 5. Typography and design (palette, lattice, spines, motion unchanged)

The look stays "manuscript library": parchment, ink, rubric red, gold, lattice, book spines, staggered load motion, dark "ink night". Only letterforms change per language. Specimens (rendered on the site palette) were sent with this plan.

### 5.1 English (proposal A; B as alternative)
| Role | Font | Notes |
|---|---|---|
| Display (h1–h3, series titles, brand line) | **Cormorant Garamond** 700 + 700 italic (rubric-red italic for the «may Allah preserve him» / dua line, echoing the Ruqaa flourish) | High-contrast, calligraphic Garamond; refined next to Ruqaa; full set of transliteration letters |
| Text | **Cardo** 400 / 400 italic / 700 | Designed for scholars and classicists: the best diacritic coverage of all candidates (ā ḥ ṣ ṭ ẓ ʿ ʾ…). Italic for transliterated terms in prose |
| Labels, nav, buttons, numerals | **Reem Kufi** (already shipped, Latin 600) | Same geometric labels as the Arabic site; uppercase + wide tracking **only** in `lang=en` (Arabic keeps `letter-spacing:0`) |
| Arabic fragments inside English | Noto Naskh Arabic (existing) | `lang="ar" dir="rtl"` spans |
| Alternative B | Alegreya 800/400 (calligraphic, heavier, closest in weight to Ruqaa) | Warmer, louder; same coverage |

Scale (px, desktop): body 20 / 1.7 (Cardo's x-height is smaller than Naskh's, so +2 px) · h1 clamp(38,6vw,68)/1.08 · h2 30/1.2 · h3 22/1.3 · labels 13 uppercase · lesson numbers lining numerals. Font files: custom subsets (Basic Latin + Latin-1 + the ~40 transliteration letters + typographic punctuation), one woff2 per face ≈ 20–25 KB, ≈ 110 KB total for five faces, `font-display: swap`, only the body face preloaded. **Lesson learned from the specimen:** `unicode-range` must include U+02B0–02FF (ʿ ʾ), otherwise those two letters fall back to a different font.

### 5.2 Urdu (Nastaliq for reading, Naskh/Kufi for small text)
| Role | Font | Notes |
|---|---|---|
| Display + text | **Noto Nastaliq Urdu** 400/700 (default) — or **Gulzar** 400 for headings (more calligraphic, lighter, one weight, 209 KB) | Nastaliq is what Urdu readers expect. Headings 32–40 px / line-height 2.0–2.1; text 20–21 px / 2.2–2.4; never letter-spacing; no italics, no uppercase |
| Small UI (< 16 px: dates, badges, tab bar) | Noto Naskh Arabic / Reem Kufi (existing) | Nastaliq loses legibility when small; this is standard practice and costs no extra bytes |
| Basmala | Aref Ruqaa (existing) | Same in all languages |
| Arabic quotations/titles inside Urdu | Noto Naskh Arabic, `lang="ar"` | Arabic text keeps its own letterforms (no ی/ک substitution) |

Weight: Noto Nastaliq Urdu 400+700 ≈ 316 KB (cached for a year, loaded only on `/ur/` pages, 1–2 preloads); Gulzar adds 209 KB. We will test glyph subsetting (keeping shaping features) to cut this.

### 5.3 Direction and details
- **English is LTR**: logical CSS already; the few physical rules and the "next" chevrons (`chevron-left` today means "forward" in RTL) get direction-aware classes. Shelf scroll direction, drawer slide side, hero composition, bottom bar and book-spine text are checked per direction.
- Mixed text uses `<bdi>`/`dir` isolation so Arabic fragments in English/Urdu pages and Latin fragments (numbers, «MP3») in Urdu stay in order.
- `lang` attributes everywhere (screen readers pick the voice from them); iOS 15 compatibility kept (no reliance on `size-adjust`, `color-mix` fallbacks, opaque header).
- Dark mode, reduced-motion, focus rings and contrast rules are inherited; axe runs per language.

## 6. Architecture (summary)

- `site/i18n/ar.js` (generated from the current strings), `en.js`, `ur.js`; `t()` in `core.js`; views never contain literal Arabic UI text any more.
- `href.*` builders and `resolve()` become language-aware (`state.lang`, set per build pass and from `<html lang>` in the browser).
- `scripts/build.mjs` loops over `LANGS`; shared data, per-language render; sitemap/hreflang/alternates written once.
- Language-specific CSS (`lang-en.css`, `lang-ur.css`, small) and fonts load **only** on those pages; **Arabic pages get no extra requests** and no larger fonts.
- Title composer + glossary lookups at build time (pure functions, tested).
- Admin portal: Arabic UI unchanged. Later phase: optional English/Urdu fields for series, books, banners, announcements, schedule notes, home headings; reports list missing translations; manuals and restore guide updated (both manuals kept in step).
- Health check also visits `/en/` and `/ur/`.

## 7. Quality process
1. Terminology glossary + transliteration style sheet agreed first (short document).
2. We draft all strings and glossary entries; a **native reviewer** (English and Urdu, ideally a student of knowledge familiar with the terminology) approves via a review sheet; corrections go back into the dictionaries.
3. Automated checks: every key present in all languages, no Arabic letters inside English strings (except marked quotes), no placeholders left, plural/number formats, glyph coverage test for every character used (no fallback fonts), line-length/overflow screenshots in 3 languages × light/dark × desktop/mobile.
4. Reviewer walks the soft-launch site on a phone before it is indexed.

## 8. Safety net, rollout, rollback
| Step | What ships | Visible to the public? | Proof required |
|---|---|---|---|
| A | i18n plumbing; Arabic generated from dictionary | No change | Golden hash: all ~3,300 Arabic pages identical; e2e 27/27, xss, a11y, perf budget |
| B | Hreflang tags + switcher code behind the flag | No (flag off) | Arabic diff reviewed; sitemap unchanged |
| C | `LANGS=ar,en` soft launch (noindex, no switcher, not in sitemap) | Only by direct link | Reviewer sign-off; axe per language; file count < 12,000 |
| D | Index + sitemap + switcher on; Search Console sitemap resubmitted | Yes | Monitor Search Console (hreflang, coverage) for 2 weeks |
| E | Same for `ur` | | |
Rollback at any point: revert the single flag/commit, or Cloudflare deployment rollback (≈ 1 minute). The database, portal and Arabic content are never touched by these steps (translations live in git until the optional portal phase).

## 9. Phases and effort (S ≈ one session, M ≈ 2–3, L ≈ 4+)
1. **P0 — decisions, glossary, style sheet, string inventory sheet** (S, needs owner)
2. **P1 — plumbing, Arabic byte-identical, flag, golden tests** (M)
3. **P2 — English: dictionary, fonts, LTR CSS, title composer, hreflang, tests, soft launch** (L)
4. **P3 — Urdu: dictionary, Nastaliq typography, search normaliser, tests, soft launch** (L)
5. **P4 — launch steps C→D→E** (S each, with waiting time for review)
6. **P5 — portal: translation fields, quality-report entries, manuals** (M, optional but recommended)
7. **P6 — Tier-3 title batches with a reviewer** (ongoing)

## 10. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Breaking the Arabic site | Golden-hash refactor, flag, soft launch, instant rollback |
| Googlebot treats auto-switch as a redirect | No server redirects; first-party script skips crawlers; deep links only get a banner; hreflang + x-default Arabic |
| Arabic readers with English phones land on English | Auto-switch only where the signal is strong (Urdu); suggestion banner for English; the choice is remembered |
| Mistranslation of religious terms | Glossary first, native review, Arabic fallback for anything unreviewed, bio/official wording only with team approval |
| Poor Urdu rendering on old phones | Nastaliq only ≥ 18 px, Naskh/Kufi for small text, tested on Chromium + WebKit; fonts cached 1 year; iPhone 7/iOS 15 constraints respected |
| Page weight and speed | Fonts only per language, custom subsets, budgets enforced by test, Arabic pages unchanged |
| File-count growth (limit 20,000) | ~10,100 now; test fails above 15,000; Tier-3/less-valuable pages could be dropped from pre-rendering if ever needed |
| Translation drift as content grows | Quality report lists missing glossary entries; new series show Arabic until added |
| Maintenance cost of three languages | One dictionary per language, one glossary, tests that fail on missing keys |

## 11. Decisions needed from the owner
1. **Auto-switch behaviour** (§4): banner for all; auto for Urdu + banner for English (proposed); or auto for both.
2. **English fonts** (§5.1): A Cormorant Garamond + Cardo (proposed) or B Alegreya.
3. **Urdu fonts** (§5.2): Noto Nastaliq Urdu only (proposed), or Gulzar for headings + Noto Nastaliq Urdu for text.
4. **Urdu digits:** Western (1440, proposed: most Urdu websites) or Urdu-Indic (۱۴۴۰, closer to print).
5. **Spelling of the name in English/Urdu** and whether the team approves the translated official-site line («Official website of…»).
6. **Who reviews** English and Urdu (native reader) and who approves the bio translation for the team.
7. **Scope at launch:** all page types in both languages (proposed), or discovery pages first (home, sections, series, books, schedule) and lesson pages later.
8. **Tier-3 titles:** are free-text chapter headings transliterated later with a reviewer, or left in Arabic script permanently?
