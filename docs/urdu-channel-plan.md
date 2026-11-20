# Plan: the Sheikh's Urdu YouTube channel (@DrWasiullahAbbas)

Status: **decisions taken 2026-11-20 (section 7); phases 2 and 3 BUILT (classification + second channel in the daily sync + the new section), switched OFF in `config.json`: nothing appears on the site until the owner sets the channel's state to «publish» (section 11).** Written from `tools/survey_channel.py` output (channel_all.json, 2,630 videos). Tools: `tools/survey_channel.py` (list the channel), `tools/urdu_channel.py` + `data/urdu_channel_rules.json` (sort into series/sections/topics, write the review files), `tests/urdu_channel_check.py`.
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

## 8. Decisions taken (owner, 2026-11-20)
1. New section «الأسئلة والفتاوى (بالأردية)»: **yes.** 2. Clip topics (2.1): **approved.** 3. Real topics: **to be obtained from transcripts or similar; until then every video must be identifiable** (section 9). 4. Dates: **as proposed** (title date, else upload date, shown in Hijri). 5. Shorts and English-titled clips: **included.** 6. **Daily sync.** 7. Series names: **approved** (the series «مجالس السؤال والجواب (بالأردية)» is the Quran-class Q&A series, named without «بعد درس القرآن» because the 2020 sessions are not tied to a Quran class). 8. The Sheikh's team will **review** (the review CSV in section 10 is what they read).

## 9. Identifying a video before its real topic is known
A visitor must always be able to tell one session from another, with only facts that are really in the data:
- **Tafsir sessions:** series → surah (section) → the title carries the ayah range and, where it says so, «سؤال وجواب» (e.g. `Surah Humazah | Ayah 01-09`).
- **Q&A sessions and Hajj classes:** section by year, then the lesson date (Hijri, from the title when it has one), the weekday, the length, and for Hajj the lesson number from the title (`Dars-12`).
- **Clips:** the Sheikh's own question as the title (Urdu script when the title has it), the clip number (`wma1234`) when it has one, its topic series, the date.
- Two videos on one date and the same label (parts of one session) are told apart by their length; they are flagged in the review so a person can mark part 1 / part 2.
- **Getting the real topics (phase 6, later):** (a) the channel owner exports the YouTube-generated captions from YouTube Studio (no scraping); or (b) the team supplies the audio of the Quran-class Q&A sessions and a speech-to-text model runs on the owner's computer (no YouTube downloading); the result is a time-coded list of the questions, **reviewed by a person** before it is shown (nothing machine-written appears on the site unreviewed). Until then no topic is invented for a Q&A session.

## 10. First dry run (2,630 videos, built 2026-11-20)
`python tools/urdu_channel.py --from channel_all.json` writes `urdu_review.csv` (one row per video) and `urdu_review.txt`. Result: the Quran class (tafsir with its Q&A) 300 videos, Q&A sessions 80, Hajj classes 74, «اليوم الآخر» 7, the Deoband book 10, talks 25, and the 2,047 clips in 11 topics plus «متفرقة»: about 400 clips (20%) match no topic word and stay in «متفرقة» (never guessed), about 270 are flagged «ambiguous» (a tie between two topics). The rules are meant to be corrected by the team in the CSV: change the `series` column of a row and the rule words can be extended.
**Same recording on two channels:** 9 lessons already on the site from the Haram channel (`hajj-urdu` 2025-05/06, `tawheed-urdu-live`, `aqeeda-manasik-urdu`) have a channel video within a day and of a similar length. Decision still needed: show each lesson once, and from which channel (recommended: the Sheikh's own channel, which keeps syncing; the old Haram-channel entry is then hidden in the portal).

## 11. Built (phase 3) and how to switch it on
**What exists:** `config.json` → `extra_channels` (the channel's id and a `state`); `ingest.py` reads an extra channel (all its videos are CONFIRMED, removals are judged per channel, playlist names are saved in `data/channel_playlists.json`); `build_catalogue.py` sorts its videos with `tools/urdu_channel.py` + `data/urdu_channel_rules.json` into the catalogue; the new section «الأسئلة والفتاوى (بالأردية)» (`urdu-qa`, icon, texts, portal and report lists); `tools/sync_report.py` lists new clips that matched no topic; tests `tests/urdu_channel_check.py` (64), `tests/urdu_sync_check.py` (20). Arabic output is byte-identical (golden test).
**Behaviour worth knowing**
- The Urdu series carry `nohome: true`: they never appear in the Arabic home page's automatic shelf or «latest» block (series already there stay). Editors can still hand-pick them in the portal's home layout.
- Clips get no lesson number (a number would replace their title with «السؤال N»). Hajj classes get one section per Hajj season (their numbers restart every year, so the number stays in the title). Surahs are the sections of the tafsir series (chronological order of teaching).
- A channel video whose id is already on the site (`library/makkah/haram.json`, e.g. the 2016 «علماء ديوبند كو مشوره») is not added twice; the existing entry stays.
- Rules are applied at every build: improve `data/urdu_channel_rules.json` (topic words, series names) and the next sync re-sorts everything. Editors' corrections in the portal are patches on top and survive.
- Size when published: about 2,630 more lesson pages (the site grows from about 3.4k to about 6.1k pages and about 145 MB to about 280 MB of static files; Cloudflare's limit is 20,000 files). The first sync reads about 2,630 videos (about 55 API units).
**How to switch it on (owner)**
1. Merge the branch (state is `off`: nothing changes).
2. Optional preview: set `"state": "collect"` in `config.json` (the sync reads the channel into `data/videos.jsonl`, still nothing on the site).
3. After the team has reviewed the CSV and the open decisions (the 9 duplicate lessons) are settled: set `"state": "publish"`. The next daily sync (or Actions → YouTube sync → Run workflow) imports and publishes; the run summary lists the first 50 new lessons and every clip with no topic. Check the site: `/section/urdu-qa/`, a tafsir surah, a Hajj season, a clip, the home page.
4. To undo: set the state back to `off` (the next sync removes them from the catalogue; `videos.jsonl` keeps the data).
