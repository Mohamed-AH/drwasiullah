# Admin manual — drwasiullah.com portal

For the people who run the site day to day (editors and admins). The portal is in Arabic; the names of menus and buttons are quoted below exactly as you see them, with the meaning in English. For setting the portal up or deploying it, see [admin-setup.md](admin-setup.md) (owner/technical).

Arabic edition for the team: [admin-manual.ar.md](admin-manual.ar.md). Keep the two in step when the portal changes.

Portal address: **https://admin.drwasiullah.com** — it works on a phone, but uploading and arranging long series is easier on a computer.

---

## 1. The one idea to understand: two speeds

| Speed | What | How it reaches visitors |
|---|---|---|
| **Instant (about a minute)** | banners, announcements, «no lesson tonight» notices | saved → visible within ~60 seconds. No Publish. |
| **After «النشر» (Publish)** | everything else: lessons, series, books, order, the weekly schedule, the home page layout | saved in the portal → press **«النشر»** → visitors see it in about 2 minutes |

Saving never changes the live site by itself, except the instant items. Several people can edit, then **one** Publish ships everything together. The «النشر» page tells you how many changes are waiting.

**What Publish ships:** only items whose status is **«منشور» (published)**. Drafts («مسودة») and hidden («مخفي») items are kept in the portal but never shown.

## 2. Logging in and roles

- Open the address, choose Google or the emailed one-time code. Only emails the owner added can enter (two locks: Cloudflare Access, then the portal's own user list).
- Top right: your email and role. **«خروج»** logs you out.

| | Editor («محرر») | Admin («مدير») |
|---|---|---|
| Browse series, lessons, books | ✔ | ✔ |
| Upload lessons, new series, new books | ✔ | ✔ |
| Edit titles, numbers, dates, sections, descriptions | ✔ | ✔ |
| Hide / show, arrange lesson order | ✔ | ✔ |
| **Publish** | ✔ | ✔ |
| Banners, announcements, weekly schedule, «no lesson tonight» | — | ✔ |
| Home page layout | — | ✔ |
| Analytics, reports | — | ✔ |
| Users, audit log | — | ✔ |

(The owner can change this table in `admin/src/roles.mjs`.)

## 3. Daily jobs, step by step

### 3.1 Add a new audio lesson («رفع درس»)
1. Menu **«رفع درس»**. Choose the **series**. The next number is filled in for you and the last lesson is shown so you can check.
2. Drag the audio files in (mp3 or m4a) or click the box. Several files at once are fine; they are numbered in file-name order.
3. Check each row: **number** («الرقم»), **title** («العنوان»), **Hijri date** («التاريخ الهجري»). The default date is today — correct it if the recording was another day; «تطبيق على كل الملفات» sets one date for all rows. Duplicate numbers are flagged.
4. Status per row: «منشور» (will be shown after Publish) or «مسودة» (kept, not shown).
5. Press **«رفع وحفظ»**. A progress bar shows each file; if the connection drops it retries. **Do not close the tab until it says it is done.** Re-uploading the same file is harmless.
6. Menu **«النشر» → «نشر الآن»**. The lesson is on the site in about 2 minutes.

> **Many files at once (a whole folder, WAV files, files that need volume normalising and compressing)?** Do not use this screen: use the command-line tool described in [audio-batch.md](audio-batch.md). It optimises the audio, registers the lessons, and leaves them as unpublished changes for you to check and Publish here.

Recommended audio: mono, about 48 kbps (small files, plays on every phone). A very large file (over ~100 MB) is only a warning.

Part lessons (one lesson in two files) use a letter after the number, e.g. 22a and 22b.

### 3.2 A new series
«رفع درس» → **«+ سلسلة جديدة»**: an id (lowercase English letters, digits and dashes — it can never be changed, so choose carefully, e.g. `sahih-muslim-audio`), the title, the section of the site, the unit word («الدرس»/«المحاضرة»), whether lessons are numbered, and an optional one-line description. A series appears on the site only once it has at least one **published** lesson.

### 3.3 Fix a title, number, date or section
- Menu **«السلاسل»** → open the series → click the lesson title. Change the title, number, section («الباب») or Hijri date (empty = no date) → save → **«النشر»**.
- The Hijri date is entered as day / month / year. A date that does not exist (e.g. 30 of a 29-day month) is refused.
- **YouTube lessons** can be edited too: what you change is remembered as a *patch*; the daily YouTube sync can never undo it, and anything you did not touch keeps following YouTube. **«التراجع عن تعديلاتي»** removes all your changes on that item and it follows the sync again.
- If the page says someone else changed the item while you were editing (message about «عُدِّل هذا العنصر من مستخدم آخر»), reopen the page and redo your change — nothing is lost silently.

### 3.4 Hide or show something
Series page → the lesson's row → **«إخفاء»** / **«نشر»** (status buttons), or set the status on its edit page. A hidden series hides all its lessons. Hidden items stay in the portal and in the saved order, so un-hiding puts them back where they were.

### 3.5 Move a lesson to another series
Open the lesson's edit page → choose the other series → save → «النشر». Use this instead of deleting and re-uploading.

### 3.6 Put the lessons of a series in a different order («ترتيب الدروس»)
Normally the site orders a series by lesson number (or newest first when unnumbered). If a mistake is reported, open the series → **«ترتيب الدروس»**:
- **Drag** a lesson by its ⋮⋮ handle (mouse or finger), **or** focus the handle and press **Space**, move with the arrow keys, Space again to drop (Esc cancels).
- Long series: tick several rows and use «المحدد إلى الأول / إلى الآخر / إلى الموضع N»; or use a ready-made sort («حسب الرقم», «حسب العنوان»…), then adjust. **«تراجع»** undoes the last move.
- Press **«حفظ الترتيب»**, then «النشر». **«العودة إلى الترتيب التلقائي»** removes the manual order.
- Numbers and titles are never changed by arranging — only the display order, the series page and the player's «السابق / التالي».
- Lessons added later appear **after** the arranged ones.

### 3.7 Books («الكتب»)
**«الكتب»** lists them. Click one to edit, or **«+ كتاب جديد»**: title («العنوان»), group («المجموعة», pick one or type «مجموعة جديدة»), language, optional note, status, and one or more files. A file is either an upload (PDF or EPUB, «إضافة ملف») or an external https link («إضافة الرابط»); at least one file is required. Then «النشر».

### 3.8 Publish («النشر»)
Menu **«النشر»** → **«نشر الآن»**. You get a confirmation; the site updates in about 2 minutes. Pressing it twice quickly shows «انتظر دقيقة». If it says «تعذّر طلب النشر», tell the owner (usually the GitHub token has expired — see §7).

## 4. Admin-only pages

### 4.1 Banners («البانرات») — instant
A strip across the top of every page of the site. Fill: text (plain, up to 200 characters), kind («معلومة» info / «تنبيه» notice / «عاجل» urgent), optional https link, optional start and end time (Makkah time), whether visitors may dismiss it. Each banner row has **«إيقاف» / «تفعيل»** (stop / start) and «تعديل». To remove one: «تعديل» → **«حذف البانر»**. Give a test banner an end time so it cannot be forgotten. Visitors who dismissed a banner won't see that banner again on the same device.

### 4.2 Announcements («الإعلانات») — instant
News items shown on the home page («آخر الإعلانات», latest three) and on the page `/news/`. Title, text (plain; line breaks kept), optional https link with button text, **pinned** (stays first), status (published / draft), optional publish date (a future date keeps it hidden until then). To remove: «تعديل» → **«حذف الإعلان»**, or set it to draft.

### 4.3 Weekly schedule («الجدول»)
- **«إشعار اليوم»** (instant): cancel or change one slot on one date, e.g. «ملغى اليوم — لعذر طارئ». A badge appears on that slot's card on the right weekday and disappears after the date. Delete the notice to undo.
- Weekly slots (need «النشر»): days, title, time (free text), order within the day, language, optional link to a series, optional note; **«مخفي (غير مؤكد)»** hides an unconfirmed slot. The note under the table and the **Mixlr live button** (https://mixlr.com links only; leave empty to hide the button) are on the same page.
- Times shown to visitors are Makkah time.

### 4.4 Home page layout («الصفحة الرئيسية») — needs «النشر»
Below the fixed header (name and search) there are six blocks: announcements, schedule, about the Sheikh, sections, book shelf, latest materials. For each: show/hide, **رفع ↑ / خفض ↓**, an optional custom heading (plain text), and for the shelf (3–16) and latest (4–24) how many to show. The shelf can show **hand-picked series** instead of the biggest ones. A block with nothing to show (no bio, no announcements…) stays hidden even if switched on. **«إعادة الترتيب الافتراضي»** restores the original layout.

### 4.5 Analytics («الإحصاءات»)
Anonymous counts only (lesson and kind of event; nothing about the visitor). **Listen** = 30 seconds of real listening in one page visit; **download** = the download button; **video** = the video play button. Choose the period (7/30/90 days, a year, all), one series or all, and the ordering of the top-lessons table. Cards show the change against the previous equal period; the chart is daily/weekly/monthly (oldest on the right); «عرض الجدول» shows the same numbers as a table; **«تنزيل CSV»** exports per-lesson totals. Counting began when the counters went live; older history does not exist.

### 4.6 Reports («التقارير»)
- **ملخص المحتوى** — totals, sections, series with Hijri periods (printable).
- **قائمة دروس سلسلة** — every lesson of one series in display order (tick «مع غير المنشور» to include drafts/hidden).
- **جودة البيانات** — a checklist for reviewers: duplicate numbers, unnumbered lessons in numbered series, lessons without a date, audio without a duration, drafts/hidden items, empty series, books without files. Many of these are gaps in the original sources, not mistakes on the site. Also available for a single series.
- **CSV** files for lessons, series and books open directly in Excel (Arabic included).
- To print or save as PDF: the **«طباعة / حفظ PDF»** button, then choose «Save as PDF» in the print dialog.

### 4.7 Users («المستخدمون») and audit log («السجل»)
- **Add a person:** first the owner adds the email to the Cloudflare Access policy (see admin-setup.md step 1), then here: email, role, name. **To stop someone:** set their status to «موقوف» (suspended) instead of deleting (فعّال = active). The system refuses to leave no active admin.
- **Audit log:** every change with who, when, what and the before/after values. Use it to answer «who changed this?».

## 5. Rules of thumb
- **Don't edit `site/data/library.json`, `makkah.json`, `haram.json`, `overrides.json`, `order.json`, `schedule.json` or `home.json` by hand** — they belong to the database and are overwritten by Publish. Change things in the portal.
- Never run `scripts/db.mjs seed` against the live database — it erases unpublished edits.
- Titles, dates and religious texts come from the Sheikh's team or the original sources. Don't invent or "improve" scholarly content; if something looks wrong, check the source first.
- Only the Sheikh's own lessons belong on the site.
- Dates are **Hijri only** everywhere.
- Banners and announcements are plain text; links must be https.

## 6. When something goes wrong

| You see | Meaning / what to do |
|---|---|
| «لا تملك صلاحية» after logging in | Your email passed Cloudflare but isn't in «المستخدمون». Ask an admin. |
| Page says «غير مُهيّأ» | The portal isn't configured (owner: see admin-setup.md). |
| «عُدِّل هذا العنصر من مستخدم آخر…» | Someone saved first. Reopen the page and redo your change. |
| Upload stops / «Leave site?» prompt | Wait for the progress to finish; if it failed, press upload again — files already stored are reused. |
| «تعذّر طلب النشر من GitHub» | Publish couldn't start. Tell the owner (token expired?). Your changes are safe and still waiting. |
| «انتظر دقيقة» | A publish was requested seconds ago. Wait. |
| Published but the site doesn't show it | Wait 2–3 minutes and hard-refresh (Ctrl+F5). If still missing, check «النشر» that the item is «منشور» and its series has a published lesson. The owner can see the Publish run under GitHub → Actions → «Publish from the admin portal». |
| Banner/announcement still visible after removing | The live feed is cached for up to a minute. Refresh once more. |
| A YouTube lesson reverted my title | It can't (patches are permanent). Check you pressed «النشر» after saving, and that you didn't press «التراجع عن تعديلاتي». |
| Series missing from the site | It has no published lesson, or its status is hidden/draft. |

## 7. Owner / maintenance cheat sheet
(Commands run in Git Bash from the repository folder after `git pull`.)

| Task | How |
|---|---|
| Deploy a new portal version | `npx wrangler deploy -c admin/wrangler.jsonc` |
| Deploy the public site / its Worker | merge to `main` (Cloudflare builds) — or fallback `npx wrangler deploy` |
| Apply database changes shipped with a version | `npx wrangler d1 migrations apply drwasiullah --remote` |
| Renew the Publish token | GitHub → fine-grained token (Actions: read & write, this repo) → `npx wrangler secret put GH_DISPATCH_TOKEN -c admin/wrangler.jsonc` |
| Add the first/another admin by command | `npx wrangler d1 execute drwasiullah --remote --command "insert into users (email, role, name) values ('EMAIL','admin','NAME')"` |
| Backups and restore | **Step-by-step: [restore-guide.md](restore-guide.md).** A nightly GitHub Action commits the content, including banners and announcements (not users, the audit log or counters), to `backup/`. D1's own Time Travel restores the whole database to any minute of the last 7 days (Cloudflare dashboard → D1 → drwasiullah → Time Travel, or `wrangler d1 time-travel`). |
| Check the site is healthy | `https://drwasiullah.com/health` (JSON); a health Action runs every 6 hours. |
| Broken audio/PDF links | `python tools/check_links.py` (owner's computer). |
| Re-sync YouTube now | GitHub → Actions → «YouTube sync» → Run workflow. |
| Free-tier limits to remember | D1: 100,000 row writes/day (counters use one per counted event); Workers: 100,000 requests/day; Access: 50 users; R2: 10 GB free (shared with the owner's other project), cost above that is cents. |

## 8. Glossary
**Series** («سلسلة») a course or book being taught · **Lesson** («درس») one recording · **Section** («القسم») a top-level group on the site (visual, audio, lectures, khutab, Urdu, books) · **الباب** the chapter inside a series · **Publish** pushes saved changes to the live site · **Draft / Hidden** kept but not shown · **Patch** your edit on a YouTube item, layered over the automatic data · **Hijri date** the only date format used on the site.
