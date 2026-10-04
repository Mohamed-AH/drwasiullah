#!/usr/bin/env python3
"""Build site/catalogue.json from videos.db.

Unlike export.py (which needs every series/subject filled in by hand), this
derives series, lesson numbers and subjects from the Arabic titles, so the
site is useful straight after `ingest.py`. Values you set manually in
videos.db (series, subject, lesson_number, title_ar) always win.

Included: CONFIRMED / MANUAL_APPROVED, plus REVIEW videos whose title names
the Sheikh. Never included: MANUAL_REJECTED / REJECTED, other speakers.
"""
import json, os, re, sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent
OUT = BASE / "site" / "catalogue.json"
PLAYLISTS = Path(os.environ.get("PLAYLISTS_JSON") or BASE / "data" / "playlists.json")   # written by ingest.py

AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
NAME = re.compile(r"وصي\s*(ال)?له|وصى\s*الله|wasi", re.I)

# (series id, title, subject, description, matcher on normalized title)
SERIES = [
    ("muslim", "شرح صحيح مسلم", "الحديث وشروحه",
     "شرح مفصّل لصحيح الإمام مسلم، مرتب بحسب الكتب والأبواب.", r"شرح\s*(صحيح\s*|مقدمه\s*صحيح\s*)?مسلم"),
    ("ibn-majah", "شرح سنن ابن ماجه", "الحديث وشروحه",
     "شرح سنن الإمام ابن ماجه مرتبًا بحسب الكتب.", r"شرح\s*سنن\s*ابن\s*ماج"),
    ("nasai", "مجالس سماع سنن النسائي", "الحديث وشروحه",
     "مجالس سماع سنن الإمام النسائي مع التعليق.", r"سنن\s*النسائي"),
    ("fadail-sahabah", "السماع والتعليق على فضائل الصحابة", "الحديث وشروحه",
     "مجالس السماع والتعليق على كتاب فضائل الصحابة بتحقيق الشيخ.", r"فضائل\s*الصحابه"),
    ("jami", "الجامع لأخلاق الراوي وآداب السامع", "علوم الحديث",
     "شرح كتاب الخطيب البغدادي في آداب الرواية وطلب الحديث.", r"الجامع\s*لاخلاق\s*الراوي"),
    ("nuzhat", "شرح نزهة النظر", "علوم الحديث",
     "شرح نزهة النظر في توضيح نخبة الفكر للحافظ ابن حجر.", r"نزهه\s*النظر"),
    ("shura-urdu", "تفسير سورة الشورى (بالأردية)", "التفسير",
     "دروس مباشرة باللغة الأردية في تفسير سورة الشورى.", r"سوره\s*الشورى"),
]
# Which site section each series lives in (default: "duroos" = visual lessons).
SECTION_OF = {"misc": "lectures", "shura-urdu": "urdu"}
MISC = ("misc", "محاضرات وفوائد متفرقة", "محاضرات وفتاوى",
        "محاضرات وكلمات وفتاوى وفوائد منفردة.")


def norm(s):
    s = re.sub(r"[ً-ٰٟـ]", "", s or "")
    return s.translate(str.maketrans("أإآىةی", "ااايهي"))


def num(s):
    return int(s.translate(AR_DIGITS))


def number_of(t):
    m = re.search(r"(?:المجلس|الدرس|مجلس السماع[^(]*?|فضائل الصحابة|مجالس سماع سنن النسائي)\s*[(\[]?\s*([0-9٠-٩]+)", t)
    return num(m.group(1)) if m else None


def section_of(sid, t):
    """The book ('كتاب …') inside a large series, for grouping."""
    if sid == "muslim":
        m = re.search(r"[\"“«]\s*(كتاب\s*[^\"”»\d(]+?)\s*[\"”»]", t) or re.search(r"(كتاب\s*[^\"”»\d(]+)", t)
        if m: return re.sub(r"\s+", " ", m.group(1)).strip()
        if "مقدمه" in norm(t): return "المقدمة"
    if sid == "ibn-majah":
        m = re.search(r"(كتاب\s+[^\d\-–ح]+?)\s*(?:ح\b|\d|لفضيله|للشيخ|$)", t)
        if m: return re.sub(r"\s+", " ", m.group(1)).strip()
    return None


def clean(t):
    t = re.sub(r"\s*(?:[-–|]\s*)?(?:ل?فضيلة|للشيخ|لشيخنا|بتحقيق|الشيخ\b|للعلامة|للدكتور|أ\.?\s*د).*$", "", t).strip(" -–|/")
    t = re.sub(r"\s+", " ", t)
    return t or None


def riyadh_date(ts):
    """YouTube gives UTC; the Sheikh teaches in Madinah (UTC+3), and the Hijri day follows local time."""
    if not ts: return ""
    return (datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S") + timedelta(hours=3)).date().isoformat()


def duration(iso):
    m = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m: return 0
    h, mi, s = (int(x or 0) for x in m.groups())
    return h * 3600 + mi * 60 + s


def playlist_series():
    """video id -> built-in series id, from the playlists that config.json maps to series (empty if not available)."""
    try:
        mapping = json.loads((BASE / "config.json").read_text(encoding="utf-8")).get("playlist_series") or {}
        members = json.loads(PLAYLISTS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    known = {s[0] for s in SERIES}
    out = {}
    for pid, sid in mapping.items():
        if sid in known:
            for vid in members.get(pid, []): out.setdefault(vid, sid)
    return out


def main():
    db = sqlite3.connect(os.environ.get("VIDEOS_DB") or BASE / "videos.db")
    db.row_factory = sqlite3.Row
    rows = db.execute("SELECT * FROM videos WHERE speaker_status NOT IN ('MANUAL_REJECTED', 'REJECTED', 'REMOVED') ORDER BY published_at DESC, youtube_id").fetchall()

    series_info = {s[0]: {"id": s[0], "title": s[1], "subject": s[2], "description": s[3]} for s in SERIES}
    series_info[MISC[0]] = {"id": MISC[0], "title": MISC[1], "subject": MISC[2], "description": MISC[3]}
    custom = {}
    lessons = []
    by_playlist, conflicts = playlist_series(), []
    for r in rows:
        if duration(r["duration_iso"]) == 0:   # live now / premiere not started: it appears on the next run, once it has a length
            continue
        title = (r["title_ar"] or "").strip() or r["title_original"]
        t = norm(title)
        approved = r["speaker_status"] in ("CONFIRMED", "MANUAL_APPROVED")
        if not (approved or NAME.search(norm(r["title_original"]))):
            continue
        sid = None
        manual = (r["series"] or "").strip()
        if manual:  # manual curation wins. A built-in series id or title joins that series; any other text makes a custom series.
            builtin = next((x[0] for x in SERIES if manual in (x[0], x[1])), None)
            if builtin: sid = builtin
            else:
                sid = custom.setdefault(manual, "c-%d" % (len(custom) + 1))
                series_info.setdefault(sid, {"id": sid, "title": manual, "subject": r["subject"] or "عام", "description": ""})
        else:
            for s in SERIES:
                if re.search(s[4], t):
                    sid = s[0]; break
        # Precedence: manual > title pattern > playlist > general lectures. A playlist only fills gaps; when it disagrees with
        # a title pattern nothing changes and the case is reported (set CATALOGUE_REPORT to a file to receive the list).
        pl = by_playlist.get(r["youtube_id"])
        if pl and not sid: sid = pl
        elif pl and sid != pl and not manual: conflicts.append({"id": r["youtube_id"], "title": title, "title_series": sid, "playlist_series": pl})
        sid = sid or MISC[0]
        n = r["lesson_number"] if r["lesson_number"] is not None else (number_of(title) if sid != MISC[0] else None)
        item = {
            "id": r["youtube_id"], "title": clean(title) if sid != MISC[0] else (clean(title) or title),
            "series": sid, "subject": r["subject"] or series_info[sid]["subject"],
            "date": riyadh_date(r["published_at"]), "duration": duration(r["duration_iso"]),
        }
        if n is not None: item["n"] = n
        sec = section_of(sid, title)
        if sec: item["section"] = sec
        lessons.append(item)

    lessons.sort(key=lambda l: l["date"], reverse=True)
    used = {l["series"] for l in lessons}
    series = []
    for sid, info in series_info.items():
        if sid not in used: continue
        ls = [l for l in lessons if l["series"] == sid]
        info.update(sec=SECTION_OF.get(sid, "duroos"), count=len(ls), seconds=sum(l["duration"] for l in ls),
                    first=min(l["date"] for l in ls), last=max(l["date"] for l in ls))
        series.append(info)
    series.sort(key=lambda s: (s["id"] == MISC[0], -s["count"]))

    updated = date.today().isoformat()
    try:   # keep the old date when nothing changed, so the daily sync does not commit a no-op every day
        old = json.loads(OUT.read_text(encoding="utf-8"))
        if old.get("lessons") == lessons and old.get("series") == series: updated = old.get("updated", updated)
    except (OSError, ValueError): pass
    out = {"updated": updated, "channel": "https://www.youtube.com/@wahatsunnah12",
           "subjects": sorted({s["subject"] for s in series}), "series": series, "lessons": lessons}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(lessons)} lessons in {len(series)} series -> {OUT.relative_to(BASE)}")
    if os.environ.get("CATALOGUE_REPORT"):
        Path(os.environ["CATALOGUE_REPORT"]).write_text(json.dumps(conflicts, ensure_ascii=False), encoding="utf-8")
    if conflicts: print(f"  {len(conflicts)} videos where the title and the playlist name different series (nothing changed; see the sync report)")
    for s in series: print(f"  {s['count']:4}  {s['title']}")


if __name__ == "__main__":
    main()
