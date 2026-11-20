#!/usr/bin/env python3
"""The Urdu channel inside the daily sync: ingest.py (extra channel), build_catalogue.py (classification into the catalogue), tools/sync_report.py.
    python3 tests/urdu_sync_check.py          (no network: the YouTube API and the files are faked)"""
import io, json, os, sqlite3, sys, tempfile, contextlib
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "tools"))
tmp = Path(tempfile.mkdtemp())
os.environ["VIDEOS_DB"] = str(tmp / "videos.db")
import ingest, build_catalogue as B, sync_report

n = 0
def ok(cond, msg):
    global n
    if not cond: sys.exit("FAIL: " + msg)
    n += 1

UC, AC = "UCurdu", "UCarabic"
NOW = "2026-11-20T00:00:00+00:00"
def conn():
    c = sqlite3.connect(tmp / "videos.db"); c.row_factory = sqlite3.Row; return c

# ---------- ingest.py: the extra channel's videos are CONFIRMED, removals are judged per channel ----------
db = sqlite3.connect(":memory:"); ingest.init_db(db)
def fake_api(endpoint, params):
    ids = params["id"].split(",")
    return {"items": [{"id": i, "snippet": {"title": f"Some Roman Urdu title {i}", "description": "", "publishedAt": "2026-05-01T10:00:00Z"}, "contentDetails": {"duration": "PT10M"}, "status": {}} for i in ids]}
real_api = ingest.api_get; ingest.api_get = fake_api
with contextlib.redirect_stdout(io.StringIO()):
    seen_u = ingest.ingest_videos(db, ["u1", "u2"], UC, "Urdu", "UUurdu", {"speaker_aliases": ["wasiullah"]}, own=True)
    seen_a = ingest.ingest_videos(db, ["a1", "a2", "a3"], AC, "Arabic", "UUarabic", {"speaker_aliases": ["wasiullah"]})
ingest.api_get = real_api
st = dict(db.execute("SELECT youtube_id, speaker_status FROM videos").fetchall())
ok(st["u1"] == "CONFIRMED" and st["u2"] == "CONFIRMED", "every video of an own channel is CONFIRMED although its title does not name the Sheikh")
ok(st["a1"] == "REVIEW", "the primary channel is judged by the speaker rules as before")
with contextlib.redirect_stdout(io.StringIO()):
    gone = ingest.mark_removed(db, {"a1", "a2"}, AC)               # a3 left the Arabic channel
ok(gone == 1 and dict(db.execute("SELECT youtube_id, speaker_status FROM videos").fetchall())["a3"] == "REMOVED", "a video missing from its own channel is marked removed")
ok(dict(db.execute("SELECT youtube_id, speaker_status FROM videos").fetchall())["u1"] == "CONFIRMED", "the other channel's videos are untouched (channels are judged separately)")

# ---------- build_catalogue.py ----------
CH = [AC]
def video(c, vid, title, secs, pub, status="CONFIRMED", **kw):
    c.execute("INSERT INTO videos (youtube_id,title_original,published_at,channel_id,channel_title,duration_iso,speaker_status,created_at,updated_at,series,lesson_number,title_ar) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
              (vid, title, pub + "T09:00:00Z", CH[0], "x", f"PT{secs // 3600}H{secs % 3600 // 60}M{secs % 60}S", status, NOW, NOW, kw.get("series", ""), kw.get("n"), kw.get("title_ar", "")))
con = sqlite3.connect(tmp / "videos2.db"); con.executescript((ROOT / "schema.sql").read_text(encoding="utf-8"))
video(con, "ar1", "شرح صحيح مسلم - المجلس 5 لفضيلة الشيخ وصي الله", 3600, "2026-01-01")
CH[0] = UC
rows = [("u_qa", "Dars E Quran | Sawal o Jawab | 20-11-2026", 4100, "2026-11-21"),
        ("u_taf", "Dars E Quran | Tarjumah wa Tafseer | Surah Ash-Shu'ara | Aayat 38-66 | 11-Dec-20", 3900, "2020-12-12"),
        ("u_hajj1", "Dars-1 | Hajj e Nabwi | Shaykh Wasiullah Abbas | 08-Jun-2023 | 19-Dhul Qaedah-1444", 3600, "2023-06-09"),
        ("u_hajj2", "Dars-1 | Hajj Special Duroos | Dr Wasiullah Abbas | 24-06-2024 | 18-12-1445", 3600, "2024-06-25"),
        ("u_clip", "Dr Wasiullah Abbas | Kya Eid e Milad manana Jayez hai | کیا عید میلاد منانا جایز ہے | wma15", 100, "2020-01-11"),
        ("u_misc", "Bilkul alag mauzu | wma99", 90, "2021-01-11"),
        ("u_dup", "Some lecture | 04-03-2023", 3000, "2023-03-04"),
        ("u_live", "Dars E Quran | Sawal o Jawab | 21-11-2026", 0, "2026-11-22"),
        ("u_manual", "Bilkul alag mauzu 2 | wma100", 90, "2021-01-12")]
for r in rows: video(con, *r, **({"series": "qa-family", "n": 7, "title_ar": "عنوان يدوي"} if r[0] == "u_manual" else {}))
video(con, "u_rej", "Dars E Quran | Sawal o Jawab | 01-01-2021", 4000, "2021-01-02", status="MANUAL_REJECTED")
con.commit(); con.close()
os.environ["VIDEOS_DB"] = str(tmp / "videos2.db")
(tmp / "pl.json").write_text(json.dumps({UC: {"u_taf": ["Dars E Quran | Tarjumah wa Tafseer | Surah Ash-Shu'ara"]}}), encoding="utf-8")
B.OUT = tmp / "cat.json"; B.CHANNEL_PLAYLISTS = tmp / "pl.json"
real_extra = B.extra_channels
B.site_lesson_ids = lambda: {"u_dup"}
def build(pub, skip=()):
    B.extra_channels = lambda: ({UC}, ({UC: {"id": UC, "state": "publish", "kind": "urdu", "skip_ids": list(skip)}} if pub else {}))
    with contextlib.redirect_stdout(io.StringIO()): B.main()
    return json.loads(B.OUT.read_text(encoding="utf-8"))

off = build(False)
ok([l["id"] for l in off["lessons"]] == ["ar1"] and [s["id"] for s in off["series"]] == ["muslim"], "state off/collect: the Urdu channel does not appear at all (the Arabic catalogue is unchanged)")
on = build(True)
L = {l["id"]: l for l in on["lessons"]}; S = {s["id"]: s for s in on["series"]}
ok(set(L) == {"ar1", "u_qa", "u_taf", "u_hajj1", "u_hajj2", "u_clip", "u_misc", "u_manual"}, f"published lessons: {sorted(L)} (no duplicate of a lesson already on the site, no zero-length live video, no rejected video)")
ok(L["u_qa"]["series"] == "quran-qa-urdu" and L["u_qa"]["date"] == "2026-11-20" and "section" not in L["u_qa"], "Quran class Q&A: its lesson date from the title, no sections")
ok(L["u_taf"]["series"] == "quran-tafsir-urdu" and L["u_taf"]["section"] == "سورة الشعراء", "tafsir: the surah is the section")
ok(L["u_hajj1"]["section"] == "حج ١٤٤٤ هـ" and L["u_hajj2"]["section"] == "حج ١٤٤٥ هـ" and "n" not in L["u_hajj1"] and L["u_hajj2"]["hd"] == "1445-12-18", "Hajj classes: one section per season, no restarting number, Hijri date from the title")
ok(S["hajj-classes-urdu"]["ordered"] is False and S["hajj-classes-urdu"]["sec"] == "urdu", "the Hajj series is not 'ordered'")
ok(L["u_clip"]["series"] == "qa-aqeedah" and L["u_clip"]["title"].startswith("کیا عید") and "n" not in L["u_clip"], "a clip: Urdu-script title, topic series, NO lesson number (a number would replace the title with «السؤال N»)")
ok(L["u_misc"]["series"] == "qa-misc", "no topic word = miscellaneous")
ok(L["u_manual"]["series"] == "qa-family" and L["u_manual"]["title"] == "عنوان يدوي" and L["u_manual"]["n"] == 7, "manual curation in videos.db (series, title_ar, lesson_number) wins")
ok(S["qa-aqeedah"]["sec"] == "urdu-qa" and S["quran-tafsir-urdu"]["sec"] == "urdu" and S["muslim"]["sec"] == "duroos", "series carry their section")
ok(all(S[x]["nohome"] is True for x in S if x != "muslim") and "nohome" not in S["muslim"], "the Urdu channel's series are kept off the Arabic home page; the Arabic series are untouched")
ok(all(s["id"] in {l["series"] for l in on["lessons"]} for s in on["series"]), "only series with lessons are written")
ok(all(set(l) <= {"id", "title", "series", "subject", "date", "duration", "n", "section", "hd"} for l in on["lessons"]), "lesson fields stay within the catalogue format")

sk = build(True, skip=["u_clip", "u_qa"])
ok({l["id"] for l in sk["lessons"]} == set(L) - {"u_clip", "u_qa"}, "skip_ids: the listed videos are left out, nothing else changes")

# ---------- extra_channels() reads config.json ----------
real_base = B.BASE
cfg_dir = Path(tempfile.mkdtemp()); B.BASE = cfg_dir
(cfg_dir / "config.json").write_text(json.dumps({"extra_channels": [{"id": UC, "state": "collect", "kind": "urdu"}, {"id": "UCx", "state": "publish", "kind": "urdu"}, {"id": "UCy", "state": "off", "kind": "urdu"}]}), encoding="utf-8")
allc, pub = real_extra()
ok(allc == {UC, "UCx", "UCy"} and set(pub) == {"UCx"}, "only state publish is shown; every configured channel is kept off the Arabic rules")
B.BASE = real_base
cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
ok(all(c.get("state") in ("off", "collect", "publish") for c in cfg["extra_channels"]) and cfg["extra_channels"][0]["id"] == "UCp2c7Qynmu9zx8Z0enQlGrw" and isinstance(cfg["extra_channels"][0].get("skip_ids", []), list), "config.json declares the channel (a valid state, skip_ids a list)")

# ---------- sync_report.py ----------
old = {"lessons": [], "series": []}
new = {"lessons": [{"id": "c1", "title": "a question", "series": "qa-salah"}, {"id": "c2", "title": "no topic", "series": "qa-misc"}, {"id": "h1", "title": "Arabic lesson", "series": "muslim"}],
       "series": [{"id": "qa-salah", "ordered": False}, {"id": "qa-misc", "ordered": False}, {"id": "muslim"}]}
pold, pnew = tmp / "o.json", tmp / "n.json"; pold.write_text(json.dumps(old)); pnew.write_text(json.dumps(new))
sys.argv = ["sync_report.py", str(pold), str(pnew)]
buf = io.StringIO()
with contextlib.redirect_stdout(buf): rc = sync_report.main()
out = buf.getvalue()
ok(rc == 0 and "NO NUMBER `c1`" not in out and "NO NUMBER `c2`" not in out and "NO NUMBER `h1`" in out and "NO TOPIC `c2`" in out and "NO TOPIC `c1`" not in out, "the report asks for a number only where the series is numbered, and lists clips with no topic")
print(f"all Urdu sync checks passed ({n})")
