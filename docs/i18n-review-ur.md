> **ON HOLD (2026-10-16):** the Sheikh asked for an Arabic-only site. This review guide is kept for when the Urdu edition is resumed (`docs/i18n-plan.md` «Resuming»); the draft texts it refers to are not in the repository.

# Reviewing the Urdu edition (draft, before it goes public)

The Urdu site is **built but hidden**: it exists at `https://drwasiullah.com/ur/…`, is marked `noindex` and has no language switcher, so only people who know the address can see it. Nothing changes for Arabic visitors. When a native Urdu reader (familiar with the terminology) is happy, one line flips it on.

## What to read
Open `/ur/` and walk through it as a visitor would: Home → a section → a series → a lesson → Books → Schedule → About → Search, on a phone and a computer, light and dark.

| Where | What it contains | File |
|---|---|---|
| Interface texts (buttons, headings, descriptions, search texts) | 181 short texts | `site/i18n/ur.js` (top part) |
| Names of sections, series, books; series descriptions; schedule phrases | the **glossary** | `site/i18n/ur.js` (`export const glossary`, bottom part) |
| Biography | translated from the approved Arabic | `site/data/bio.ur.json` |
| Vocabulary of numbered lessons («مجلس 12 · کتاب الحج · نمبر 3», «حدیث 8 سے») | words `cx.*`, `unit.*` | `ur.js` (rules: `site/js/titles.js`) |

## Style used
* Name: **شیخ وصی اللہ بن محمد عباس حفظہ اللہ** (owner's decision). The Urdu official line «شیخ وصی اللہ بن محمد عباس حفظہ اللہ کی سرکاری ویب سائٹ» is a translation of the approved English line and **needs the reviewers' confirmation**; likewise the Urdu form of the Sheikh's post («مسجدِ حرام کے مدرس اور جامعہ اُمّ القریٰ کے پروفیسر»).
* Arabic book, series and section names appear in **Urdu spelling** (ی ک ہ ۃ, hamza dropped on alef: «کتاب الزکاۃ», «ابواب الصلاۃ»). Tell us if the reviewers prefer another convention (e.g. «زکوٰۃ»).
* Digits: Western 0–9. Dates: Hijri only, «9 جمادی الثانیہ 1440ھ».
* **Not translated on purpose:** free-text chapter headings (Fath al-Bari «باب …»), sermon and lecture titles, YouTube titles that are not numbered lessons. They stay in Arabic script and are marked as Arabic.

## How to give corrections
Send the corrected text with where you saw it (page address + the Urdu wording). A correction is a one-line edit in `ur.js` or `bio.ur.json`. In the glossary the key on the left is the exact Arabic name from the data and the value is what Urdu readers see.

## Things to check carefully
1. The bio: faithful to the Arabic, names of scholars, places, institutions and the numbers/dates (it is a long text; read it fully).
2. Section and book names (one deliberate disambiguation: «کتاب الایمان (قسموں کا بیان)» is the Book of Oaths, «کتاب الایمان» is the Book of Faith).
3. The schedule phrases and the live-broadcast button.
4. Series descriptions and the home/section descriptions (they appear in search results).
5. Reading comfort: Nastaliq is taller and looser than Arabic; tell us if any text looks cramped or too small.

## Going live (owner)
In `site/i18n/langs.json` change `"indexed": ["ar"]` to `"indexed": ["ar", "ur"]` (add `"en"` too if English goes live at the same time) and merge. Then the Urdu pages enter the sitemap with `hreflang` links, the language switcher appears (desktop strip, menu, footer) and visitors whose browser is Urdu (and not Arabic) see a small suggestion banner on the Arabic pages. To undo: set it back.
