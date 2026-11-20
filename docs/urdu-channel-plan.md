# Plan: the Sheikh's Urdu YouTube channel (@DrWasiullahAbbas)

Status: **PLAN ONLY, nothing built.** Written 2026-11-20 from `tools/survey_channel.py` output (channel_all.json, 2,630 videos). Decisions needed from the owner are in section 7.
The site stays Arabic in its interface (the Sheikh's request, CLAUDE.md «Arabic only»); this adds the Sheikh's own **Urdu lessons as content**, in the existing section «الدروس بالأردية».

## 1. What the channel is (measured)
2,630 videos, about 625 hours, uploaded 2019-12 to 2026-11 (the Quran class Q&A is still uploaded weekly). Channel id `UCp2c7Qynmu9zx8Z0enQlGrw`. All videos are the Sheikh's (his name is mostly NOT in the titles). Titles are Roman Urdu; 638 of the clip titles also carry the Urdu-script version. Only 325 videos are in a playlist (23 playlists); 2,305 are loose.

| Group | How to recognise it | Videos | Hours | Typical length |
|---|---|---|---|---|
| **A. Quran class live Q&A** «درس القرآن: سوال و جواب» | `Dars E Quran \| Sawal o Jawab \| dd-mm-yyyy` (weekly since 2021) | 255 | 291 | about 68 min |
| **B. Quran class: translation and tafsir** by surah | `Dars E Quran \| Tarjumah wa Tafseer \| Surah X \| Aayat a-b \| date` | about 122-150 | about 130 | about 64 min |
| **C. Hajj classes** (Hajj e Nabwi 2023, Dars e Hajj 2024-2026) | `Dars-N \| Hajj e Nabwi …`, `Dars E Hajj …` | 91 | 91 | about 60 min |
| **D. Other lectures** (conferences in India Mar 2023, Saudi Arab ke Halaat 2023, Ramzan, Dawat ke usool, Tawheed, video book «Ulama e Deoband ko Mashwara», Ramadan 2024 clips) | various | about 80 | about 33 | 1-4 h |
| **E. Q&A clips** (fatwa clips, numbered `wma1`…`wma1648`) | `… \| wmaNNN` | 1,624 | about 66 | median 1.8 min |
| **F. Q&A shorts** (numbered `(wma sNNN)`, different questions from E) | `(wma sNNN)`, `#Shorts` | 423 | about 5 | median 44 s |

E and F together are **2,047 clips = 78% of the videos but only about 11% of the hours.** Nothing is duplicated between the `wma` and `wma s` numberings (0 of 423 shorts repeat a clip's question). 10 titles occur twice (re-uploads) and must be de-duplicated. YouTube reports 2,627 videos, 2,630 were read (3 unlisted or live entries): check before publishing.

## 2. Proposed structure on the site
Everything keeps one rule: **a visitor can reach a subject in two clicks from the home page**, and every list is ordered the same way every time.

**Section «الدروس بالأردية» (exists)**: long lessons, one series each, newest or numbered order as the data says:
1. **درس القرآن: ترجمة وتفسير (بالأردية)**: ONE series, the 17+ surahs as *sections* in mushaf order (Fussilat 41, Ash-Shura, Az-Zukhruf, Ad-Dukhan, Al-Jathiya, Al-Ahqaf, Muhammad, Al-Fath, Al-Hujurat, Qaf, Adh-Dhariyat, At-Tur, An-Najm, Al-Qamar, Ar-Rahman, Al-Waqiah, Al-Hadeed, and the later short surahs; Shu'ara and Mujadilah appear too). Sections work like Fath al-Bari's runs, so the page reads as a table of contents by surah. (One series per surah would be 17+ spines and bury everything else.)
2. **الأسئلة والأجوبة بعد درس القرآن (بالأردية)**: the 255 weekly sessions, sections by year (2021…2026). They have no topic in the title and the descriptions are boilerplate, so date is the only honest ordering; a topic index needs a person to listen.
3. **دروس الحج (بالأردية)**: Hajj e Nabwi (2023) + Dars e Hajj (2024-2026), sections by year, numbered by the lesson number in the title.
4. **محاضرات بالأردية**: conferences and tours (India 2023, Saudi Arab ke Halaat, Ramadan, Dawat…): one series for loose lectures, with a few small series where a run of numbered parts exists (Saudi Arab ke Halaat, 4 parts).
5. **كتاب مرئي: نصيحة لعلماء ديوبند (بالأردية)**: the 7 videos of the playlist.

**NEW section «الأسئلة والفتاوى (بالأردية)»**: the 2,047 clips, as **topic series** (about 12 topics, section 2.1), each ordered by clip number. This is the part that needs the most care: 2,047 clips in one list would be unusable, and in «الدروس بالأردية» they would drown the lessons. A new section costs a small change in `core.js` (the SECTIONS list), the navigation and a tile.

### 2.1 Topics for the clips (needs the owner's/team's approval; keyword-based, then reviewed)
الصلاة · الحج والعمرة · الصيام ورمضان · الزكاة والصدقات والمعاملات · النكاح والطلاق والأسرة والمرأة · الجنائز والقبور · العقيدة والتوحيد والبدع · القرآن والحديث والفقه والتقليد · الأذكار والأدعية والرقى · الطهارة · الدعوة والأخلاق · **متفرقات** (anything not matched). The topic is assigned by keywords in the title (Roman Urdu and the Urdu-script part), which is **navigation, not a ruling**; every assignment is reviewable in a CSV and correctable in the admin portal (a series change on a lesson is already supported). Clips the rules can't place go to «متفرقات» and are never guessed.

## 3. Rules for titles, numbers and dates (nothing is translated or invented)
- **Titles stay the Sheikh's own words.** Only boilerplate is removed: `Dr Wasiullah Abbas |`, `Shaik Wasiullah Abbas`, `| wmaNNN`, `(wma sNNN)`, `#Shorts`, channel hashtags. When the title has an Urdu-script version, show that one (638 clips); otherwise the Roman Urdu as written. Roman Urdu is left-to-right text inside an RTL page: it needs `dir="auto"`/`lang="ur"` handling and a browser test.
- **Series titles are Arabic** (like the existing «(بالأردية)» ones) and need the owner's/team's approval; surah names are the standard Arabic names.
- **Numbers** come from the title (`Dars-12`, `wma1234`), never invented; a missing number falls back to date order.
- **Dates:** the lesson date in the title (about 480 titles: `04-12-2020`, `11-Dec-20`, `1445`-style Hijri) is used when present, else the upload date; the site shows **Hijri only** (converted).
- **Language:** the English-titled clips with subtitles (e.g. «Ahlul Hadith are the saved sect») are listed for a decision; they are not assumed to be Urdu.
- **Audio twins** for these videos (the WhatsApp mp3s of the clips exist at the Sheikh's team) can come later through the audio-delivery route (roadmap phase 4). No YouTube downloading.

## 4. How the data gets in
The daily YouTube sync reads ONE channel (`config.json` `channel_handle`, currently `@wahatsunnah12`). Because new Quran Q&A is uploaded weekly, a one-time import would be stale in a week. Recommended: **extend the sync to a second channel** with a rules file (`playlist → series`, `title pattern → series/section/number/date`), stored in the repo as data, plus the existing review report (conflicts and unclassified videos are reported, never silently placed).
- Result: new uploads appear automatically in the right series; anything the rules can't place lands in «محاضرات بالأردية» / «متفرقات» and is listed in the sync summary.
- Editing stays in the portal: YouTube lessons are patched (overlay), so a correction survives the daily sync.
- Alternatives: (A) one-time curated import like `haram.json` (stale quickly, 2,600 items is too much to curate by hand); (C) import now, automate later (double work).

## 5. Size and risk
- +2,630 lesson pages (site total about 3.4k → about 6k pages; the build limit is 20,000; build time roughly doubles to about 15-20 s). The merged `library.json` grows noticeably: the series pages for the clip topics (hundreds of items each) and the Quran Q&A (255) are the heavy ones; Fath al-Bari (1,224) already works as a precedent.
- D1: the catalogue mirror writes about 3.5k rows daily, far below the 100k writes/day limit.
- Existing Urdu content that may overlap and must be checked **by date and title before import**: `hajj-urdu` (7 lessons, 2025-05/06), `tawheed-urdu-live`, `aqeeda-manasik-urdu`, `tafsir-muhammad` (4, Aug-Sep 2021, from the Haram channel), and the archive.org Urdu series (`tawheed-urdu`, `bulugh-urdu`, `urdu-lectures`). No video id is shared with either existing channel (0 of 2,630), so overlap can only be found by date/title: a re-upload of the same lesson must not appear twice.
- Search: Urdu-letter normalisation already exists in the site search; Roman Urdu titles are findable in Latin; the series descriptions should carry the Arabic/Urdu subject words.
- Sheikh's name: the titles rarely contain it; the channel IS his (owner confirmed), and speaker checks in the sync must be switched off for this channel.

## 6. Phases (each ends with a check by the owner)
1. **Decisions** (section 7) and approval of series/topic names.
2. **Rules + dry run, no site change:** classify all 2,630 videos with the rules and write a review report (counts per series/topic, unclassified list, duplicates, overlaps with existing Urdu content). The owner (and the team where needed) corrects the rules until the report is right.
3. **Build:** second-channel sync, new section if approved, tests (classification, golden Arabic output unchanged, XSS, a11y with Urdu/Roman titles, build size).
4. **First import** into the site; the owner checks the home → Urdu → series → lesson paths on phone and desktop; portal corrections.
5. **Ongoing:** weekly new uploads flow in; the sync summary lists what needs a person.

## 7. Decisions needed from the owner
1. New section «الأسئلة والفتاوى (بالأردية)» for the 2,047 clips (recommended), or everything inside «الدروس بالأردية»?
2. Approve the clip topic list (2.1), and who reviews the «متفرقات» pile?
3. Titles: Urdu-script version when it exists, else Roman Urdu as written, boilerplate stripped. OK? (Or ask the team for proper Urdu-script titles for the long lessons.)
4. Dates: lesson date from the title when present, else the upload date, shown in Hijri. OK?
5. Include the 423 shorts (median 44 s) and the English-titled subtitle clips, or only the clips and lessons?
6. Sync (recommended) or one-time import?
7. Series names (section 2) approved?
8. Does the Sheikh's team want to review anything before publishing (the site's rule: nothing public without the owner pressing Publish)?
