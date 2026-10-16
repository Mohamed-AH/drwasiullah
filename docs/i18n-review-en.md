> **ON HOLD (2026-10-16):** the Sheikh asked for an Arabic-only site. This review guide is kept for when the English edition is resumed (`docs/i18n-plan.md` «Resuming»); the draft texts it refers to are not in the repository.

# Reviewing the English edition (draft, before it goes public)

The English site is **built but hidden**: it exists at `https://drwasiullah.com/en/…`, is marked `noindex` and has no language switcher, so only people who know the address can see it. Nothing changes for Arabic visitors. When the reviewers are happy, one line flips it on (see the end).

## What to read
Open `/en/` and walk through it as a visitor would: Home → a section → a series → a lesson → Books → Schedule → About → Search. Both on a phone and on a computer.

| Where | What it contains | File |
|---|---|---|
| Interface texts (buttons, headings, descriptions, search texts) | 181 short texts | `site/i18n/en.js` (top part) |
| Names of sections, series, books, and the descriptions of series | the **glossary** | `site/i18n/en.js` (`export const glossary`, bottom part) |
| Biography | translated from the approved Arabic | `site/data/bio.en.json` |
| How numbered lessons are titled («Majlis 12 · Kitāb al-Ḥajj (Pilgrimage) · No. 3») | rules + vocabulary | `site/js/titles.js` (rules), `en.js` (words: `cx.*`, `unit.*`) |

## Style used
* Names: **Shaykh Wasiullāh ibn Muḥammad ʿAbbās**, «may Allah preserve him» (owner's decision). Official line: «Official website of Shaykh Wasiullāh ibn Muḥammad ʿAbbās, may Allah preserve him».
* Transliteration of titles: ALA-LC style with ʿ (ʿayn), ʾ (hamza), macrons and dotted letters (ā ī ū ḥ ṣ ḍ ṭ ẓ); common English glosses in brackets for book names of sections, e.g. «Kitāb al-Zakāh (Obligatory Charity)».
* Dates: Hijri only, «9 Jumādā al-Ākhirah 1440 AH».
* What is **not** translated on purpose: free-text chapter headings (e.g. Fath al-Bari «باب …»), sermon and lecture titles, YouTube titles that are not numbered lessons. They stay in Arabic script and are marked as Arabic. We transliterate them later in reviewed batches.

## How to give corrections
Send the corrected text with where you saw it (page address + the English wording). A correction is a one-line edit in `en.js` or `bio.en.json`. For the glossary: the key on the left is the exact Arabic name from the data, the value is the English shown.

## Things to check carefully
1. The bio: faithful to the Arabic, no additions, names of scholars and places.
2. Hadith-book and section names in the glossary (hamza-sensitive pairs such as الأيمان «Oaths» vs الإيمان «Faith»).
3. The schedule texts and the live-broadcast button.
4. Series descriptions and the home/section descriptions (they appear in search results).

## Going live (owner)
In `site/i18n/langs.json` change `"indexed": ["ar"]` to `"indexed": ["ar", "en"]` and merge. Then the English pages enter the sitemap with `hreflang` links, the language switcher appears (desktop strip, menu, footer) and visitors whose browser is English (and not Arabic) see a small suggestion banner on the Arabic pages. To undo: set it back to `["ar"]`.
