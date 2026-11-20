#!/usr/bin/env python3
"""Checks for tools/urdu_channel.py and data/urdu_channel_rules.json:   python3 tests/urdu_channel_check.py"""
import datetime, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import urdu_channel as U

n = 0
def ok(cond, msg):
    global n
    if not cond: sys.exit("FAIL: " + msg)
    n += 1

R = U.load_rules(); M = U.build_topic_matchers(R)
def vid(title, secs, pub="2024-05-05", pls=()): return {"id": "x", "title": title, "published": pub, "seconds": secs, "playlists": list(pls)}
def cl(title, secs, pub="2024-05-05", pls=()): return U.classify(R, M, vid(title, secs, pub, pls))

# ---- rules file
ids = [s["id"] for s in R["series"]]
ok(len(ids) == len(set(ids)), "series ids are unique")
ok(all(t["series"] in ids for t in R["topics"]), "every topic points to a series")
ok({s["sec"] for s in R["series"]} <= set(R["sections"]), "every series is in a declared section")
ok(len(R["surahs"]) == 114 and [s[0] for s in R["surahs"]] == list(range(1, 115)), "114 surahs in mushaf order")
ok("qa-misc" in ids and all(t["series"] != "qa-misc" for t in R["topics"]), "qa-misc is the fallback and has no words")

# ---- dates
d, _ = U.title_date("Dars E Quran | Sawal o Jawab | 20-11-2026"); ok(d == datetime.date(2026, 11, 20), "dd-mm-yyyy")
d, _ = U.title_date("Dars E Quran | Surah Ash-Shu'ara | Aayat 38-66 | 11-Dec-20"); ok(d == datetime.date(2020, 12, 11), "dd-Mon-yy")
d, _ = U.title_date("Dars-1 | Hajj e Nabwi | 08-Jun-2023 | 19-Dhul Qaedah-14"); ok(d == datetime.date(2023, 6, 8), "dd-Mon-yyyy with a Hijri part after it")
d, _ = U.title_date("Special Message | 28 October 2026"); ok(d == datetime.date(2026, 10, 28), "dd Month yyyy")
d, _ = U.title_date("Dars-15 | 24-06-2024 | 18-12-1445"); ok(d == datetime.date(2024, 6, 24), "a Hijri year is never read as a Gregorian one")
ok(U.lesson_date("x | 04-12-2020", "2020-12-05") == ("2020-12-04", "title"), "title date used when plausible")
ok(U.lesson_date("x | 04-12-2027", "2020-12-05")[1].startswith("upload (title"), "a date after the upload is not believed")
ok(U.lesson_date("no date here", "2021-01-02") == ("2021-01-02", "upload"), "upload date as the fallback")

# ---- titles
ok(U.strip_title("Dr Wasiullah Abbas | Kya Eid e Milad manana Jayez hai | کیا عید میلاد منانا جایز ہے | wma15") == "Kya Eid e Milad manana Jayez hai | کیا عید میلاد منانا جایز ہے", "boilerplate and wma removed, parts kept")
ok(U.strip_title("Allah Ki Madad se Mayoos Mat Ho | Allah Ki Madad se Mayoos Mat Ho | Shaik Wasiullah Abbas (wma s67)") == "Allah Ki Madad se Mayoos Mat Ho", "repeated part shown once")
ok(U.strip_title("Dars-E-Hajj_1 | 07-May-2025 | Sheikh Dr.Wasiullah Abbas") == "Dars-E-Hajj_1", "date and the speaker removed, the lesson number kept")
ok(U.urdu_or_roman("Kya Eid manana Jayez hai | کیا عید منانا جایز ہے")[0] == "کیا عید منانا جایز ہے", "Urdu-script part preferred")
ok(U.urdu_or_roman("Zamzam Kadhe Hokar Peena Chahiye")[0] == "Zamzam Kadhe Hokar Peena Chahiye", "Roman Urdu kept as written when there is no Urdu script")
ok("\\" not in U.strip_title("Dars E Quran | Tarjumah wa Tafseer \\ Sawal o Jawab | Surah Humazah"), "stray backslashes removed")

# ---- surahs
for t, want in [("Dars E Quran | Tarjumah wa Tafseer | Surah Ash-Shu'ara | Aayat 38-66", 26), ("Surat Adh-Dhariyat", 51), ("Surah al-Hadeed", 57), ("Surah Humazah | Ayah 01-09", 104),
                ("Surat an-Najm", 53), ("Surah Al-Hujurat", 49), ("Surah Ash-Shura", 42), ("Tarjumah wa Tafseer Surah Takathur", 102), ("Surat At-Tur", 52)]:
    s = U.find_surah(R, t); ok(s and s[0] == want, f"surah in «{t}» -> {want}, got {s}")
ok(U.find_surah(R, "Dars E Quran | 4-Dec-2020") is None, "no surah named")

# ---- topics (spelling variants, whole-word Urdu matching)
def top(t): return U.topic_of(M, t)[0]
ok(top("Sajdy main Quraani ayaat parhna") in ("qa-salah", "qa-quran-hadith"), "sajdy is a prayer word")
ok(top("Namaz me Hawa Kharij ho Toh Wadu Rahega?") in ("qa-salah", "qa-tahara"), "namaz / wadu")
ok(top("Zakath ke paiso se jayez nahi") == "qa-zakat-muamalat", "zakath = zakat")
ok(top("Roze ke halat me kaan me tel dalna") == "qa-fasting", "roze")
ok(top("Hajj me Arafat se Ihram Baanne Par Dum Hoga?") == "qa-hajj-umrah", "hajj words")
ok(top("جنازہ پڑھنا") == "qa-janaiz", "janaza in Urdu script; the short word جن must not match inside جنازہ")
ok(top("Ek Majlis ke Teen Talaq Jayez Hai Ya Nahi?") == "qa-family", "talaq")
ok(top("Qiblah ke Bina Khana Khana Kaisa hai") != "qa-hajj-umrah", "qiblah is not a Hajj word")
ok(U.topic_of(M, "Kya Allah Humare Saath Hai")[1] in ("none", "ambiguous", "high"), "never crashes")
ok(U.topic_of(M, "bilkul alag mauzu")[0] == "qa-misc" and U.topic_of(M, "bilkul alag mauzu")[1] == "none", "no word = qa-misc, never guessed")
ok(U.topic_of(M, "Suraj Nikalne ke Waqt Tawaf ki do Rakat Padhsakte Hai?")[1] == "ambiguous", "a tie between two topics is flagged")

# ---- classification of the real kinds of titles
c = cl("Dars E Quran | Sawal o Jawab | 20-11-2026", 4100, "2026-11-21"); ok(c["series"] == "quran-qa-urdu" and c["title"] == "سؤال وجواب" and c["date"] == "2026-11-20" and c["section"] == "2026", f"Quran class Q&A {c}")
c = cl("Dars E Quran | Tarjumah wa Tafseer | Surah Ash-Shu'ara | Aayat 38-66 | 11-Dec-20", 3900, "2020-12-12"); ok(c["series"] == "quran-tafsir-urdu" and c["section"].startswith("026|") and "Aayat 38-66" in c["title"], f"tafsir {c}")
c = cl("Dars E Quran | Tarjumah wa Tafseer | Sawal o Jawab | Surah Humazah | Ayah 01-09 | 09-01-2026", 3900, "2026-01-10"); ok(c["series"] == "quran-tafsir-urdu" and c["section"].startswith("104|") and "Sawal o Jawab" in c["title"], f"tafsir with Q&A keeps its marker {c}")
c = cl("Dars-E-Hajj_12 | 07-06-2025 | Sheikh Dr.Wasiullah Abbas", 3600, "2025-06-08"); ok(c["series"] == "hajj-classes-urdu" and c["n"] == 12 and c["section"] == "حج ١٤٤٦ هـ", f"Hajj class {c}")
c = cl("Dars-15 | Hajj Special Duroos | حج اسپیشل دُرُوس | Dr Wasiullah Abbas | 24-06-2024 | 18-12-1445", 4000, "2024-06-25"); ok(c["series"] == "hajj-classes-urdu" and c["n"] == 15 and c["hd"] == "1445-12-18" and c["section"] == "حج ١٤٤٥ هـ", f"Hijri date from the title {c}")
c = cl("Dr Wasiullah Abbas | Kya Eid e Milad manana Jayez hai | کیا عید میلاد منانا جایز ہے | wma15", 100, "2020-01-11"); ok(c["series"] == "qa-aqeedah" and c["n"] == 15 and c["title"].startswith("کیا عید"), f"clip {c}")
c = cl("Maidan Arafat hi Mahshar Hoga? | میدان عرفات ہی محشر ہوگا؟ | wma1645", 60, "2026-09-23"); ok("clip" in c["flags"] or "short" in c["flags"], "flagged as a clip")
c = cl("Tawaf ke Baad Do Rakat Nafil Hai ya Wajib? | Shaik Wasiullah Abbas (wma s222)", 40, "2024-03-26"); ok("short" in c["flags"] and c["n"] == "" and c["series"] in ("qa-hajj-umrah", "qa-salah"), f"short {c}")
c = cl("Dars E Quran | یوم آخرت پر ایمان | Youm e Akhirat Par Imaan", 3000, "2022-07-24"); ok(c["series"] == "akhirah-urdu", f"akhirah {c}")
c = cl("Some title", 400, "2019-12-18", pls=["dr wasiullah abbas Video Book Ulama e Deoband ko Mashwara"]); ok(c["series"] == "deoband-book-urdu", f"video book (playlist) {c}")
c = cl("Saudi Arab ke Halaat King AbdulAziz Se Pehle| 11-Aug-2023 | سعودی عرب کے حالات", 4500, "2023-08-12"); ok(c["series"] == "talks-urdu" and "السعودية" in c["section"], f"talk group {c}")
c = cl("Payam E Taleem Confereance | Shaik Wasiullah Abbas | 04-03-2023", 15500, "2023-03-04"); ok(c["series"] == "talks-urdu" and "الهند" in c["section"], f"conference {c}")
c = cl("Dars E Quran | Sawal o Jawab | 15-11-2026", 360, "2026-11-15"); ok(c["series"] == "quran-qa-urdu", "a 6-minute part of the Quran class Q&A stays in its series")
c = cl("Special Message for the Seminar | Dr. Wasiullah Abbas Hafizahullah | 28 October 2026", 1560, "2026-11-03"); ok(c["series"] == "talks-urdu" and c["section"].startswith("99|"), f"unmatched long video = talks / other {c}")
for t, s_ in [("", 100), ("|||", 100)]: cl(t, s_)        # must not crash
ok(all(cl(t, s_)["title"] for t, s_ in [("wma1", 30), ("Dars E Quran", 3000), ("Sawal o Jawab", 3000)]), "a title that is only boilerplate still gets a name")

# ---- Hajj season from a date
for d, want in [("2023-06-08", "حج ١٤٤٤ هـ"), ("2024-06-24", "حج ١٤٤٥ هـ"), ("2025-05-07", "حج ١٤٤٦ هـ"), ("2026-06-07", "حج ١٤٤٧ هـ"), ("2027-05-10", "حج ١٤٤٨ هـ"), ("2025-11-20", ""), ("2025-12-31", "")]:
    ok(U.hajj_season(d) == want, f"Hajj season of {d}: {U.hajj_season(d)!r} != {want!r}")
ok(U.hajj_season("2025-12-31", "1447-1-3") == "حج ١٤٤٧ هـ", "the Hijri year written in the title wins over the date")

# ---- overlap with the lessons already on the site
real = U.existing_urdu_items
U.existing_urdu_items = lambda: [("2025-05-30", 3960, "site lesson", "hajj-urdu")]
rows = [{"date": "2025-05-30", "seconds": 4140, "series": "hajj-classes-urdu", "title": "Dars-18", "id": "a"}, {"date": "2025-05-30", "seconds": 1500, "series": "x", "title": "different length", "id": "b"}, {"date": "2025-06-10", "seconds": 3960, "series": "x", "title": "other day", "id": "c"}]
ok([r[4]["id"] for r in U.overlaps(rows)] == ["a"], "same day and a similar length = the same recording; other length or other day = not")
U.existing_urdu_items = real
print(f"all Urdu channel checks passed ({n})")
