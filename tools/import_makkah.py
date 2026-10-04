#!/usr/bin/env python3
"""Turn the scan of makkahscholars.org (tools/makkah_scan.json, made by scan_makkah.py) into site/data/makkah.json.

    python tools/scan_makkah.py && python tools/import_makkah.py        # then commit site/data/makkah.json

Creates the audio series «شرح فتح الباري» from group 33 (the site lists 1,224 pieces; pieces with the same file name are parts of one lesson) and adds the two last Nuzhat pieces (3727, 3728) as the two parts of lesson 22 of our Nuzhat audio series.
Nuzhat audio series (lesson 22, in two parts). Titles come from the file names on the source site; lessons are linked straight to the source's mp3 files
(the static mp3 address is used when the scan found one, otherwise the site's download link; mirroring to our own storage can come later with tools/mirror_media.py, which reads makkah.json too). Prints a summary and a sample of titles to check."""
import argparse, json, re, sys, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / "makkah_scan.json"
OUT = ROOT / "site" / "data" / "makkah.json"
SERIES = {"id": "fath-bari", "title": "شرح فتح الباري", "sec": "audio", "description": "تسجيلات صوتية لشرح الشيخ لفتح الباري.", "unit": "الدرس", "ordered": True}
NUZHA_PARTS = ["3727", "3728"]                   # the two last Nuzhat pieces: two parts of lesson 22 of our series nuzha-audio
NUZHA_N = 22
ORD = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"]
DATE = re.compile(r"\s*(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{4})\s*ه?ـ?\s*$")     # '18-10-1419 هـ' at the end of a file name: day-month-year (Hijri)
BOOK = re.compile(r"^(كتاب\s+.+?)\s+باب\b")                                       # 'كتاب بدء الوحي باب كيف …' -> section 'كتاب بدء الوحي'


def clean_url(u):
    sp = urllib.parse.urlsplit(u)
    if sp.scheme != "https": raise ValueError(f"not https: {u}")
    return urllib.parse.urlunsplit((sp.scheme, sp.netloc, urllib.parse.quote(urllib.parse.unquote(sp.path), safe="/"), "", ""))


def split_name(v):
    """Scan entry -> (title, hd, gregorian) from its file name: 'كتاب … باب … 18-10-1419 هـ.mp3'."""
    name = re.sub(r"\.(mp3|m4a)$", "", v.get("file") or v.get("title") or "", flags=re.I).strip()
    hd = date = ""
    m = DATE.search(name)
    if m:
        d, mo, y = (int(x) for x in m.groups())
        name = name[:m.start()].strip(" -_")
        if 1 <= mo <= 12 and 1 <= d <= 30 and 1300 <= y <= 1500:
            hd = f"{y}-{mo}-{d}"
            try:
                from hijridate import Hijri
                date = Hijri(y, mo, min(d, 29)).to_gregorian().isoformat()      # for sorting only; the site shows the Hijri date
            except Exception: pass
    return name, hd, date


def runs(cache, keys):
    """Consecutive lesson numbers with the same file name are the pieces (parts) of one lesson."""
    out, prev = [], None
    for k in keys:
        v = cache[k]
        if v.get("error") or not v.get("url"): prev = None; out.append((k, v, None)); continue
        name = v.get("file") or v.get("title")
        if out and prev == name and out[-1][2] is not None: out[-1][2].append(k)
        else: out.append((k, v, [k]))
        prev = name
    return out


def build(cache):
    lessons, problems, n = [], [], 0
    keys = sorted((k for k, v in cache.items() if v.get("group") == "33"), key=int)
    for k, v, members in runs(cache, keys):
        if members is None: problems.append(f"{k}: {v.get('error', 'no url')}"); continue
        n += 1
        title, hd, date = split_name(v)
        title = title or f"الدرس {n}"
        sec = BOOK.match(title)
        for i, mk in enumerate(members):
            mv = cache[mk]
            part = f" — الجزء {ORD[i] if i < len(ORD) else i + 1}" if len(members) > 1 else ""
            l = {"id": f"fath-bari-{int(mk):04d}", "title": title + part, "series": "fath-bari", "kind": "audio", "src": clean_url(mv.get("direct") or mv["url"]), "n": n}
            if sec: l["section"] = re.sub(r"\s+", " ", sec.group(1)).strip(" -–—ـ")
            if hd: l["hd"] = hd
            if date: l["date"] = date
            lessons.append(l)
    nz = [cache.get(k) for k in NUZHA_PARTS]
    for i, (k, v) in enumerate(zip(NUZHA_PARTS, nz)):
        if not v or v.get("error") or not v.get("url"): problems.append(f"{k} (Nuzhat): {(v or {}).get('error', 'not scanned')}"); continue
        title, hd, date = split_name(v)
        l = {"id": f"nuzha-audio-{NUZHA_N:04d}{'ab'[i]}", "title": f"الدرس {NUZHA_N}" + (f" — {title}" if title else "") + f" — الجزء {ORD[i]}", "series": "nuzha-audio", "kind": "audio", "src": clean_url(v.get("direct") or v["url"]), "n": NUZHA_N}
        if hd: l["hd"] = hd
        if date: l["date"] = date
        lessons.append(l)
    return {"series": [SERIES], "lessons": lessons}, problems


def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", default=str(CACHE)); ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args(argv)
    cache = json.loads(Path(a.cache).read_text(encoding="utf-8"))
    data, problems = build(cache)
    fb = [l for l in data["lessons"] if l["series"] == "fath-bari"]
    ids = [l["id"] for l in data["lessons"]]
    assert len(ids) == len(set(ids)), "duplicate lesson ids"
    Path(a.out).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    sizes = sum(v.get("size") or 0 for k, v in cache.items() if v.get("group") == "33" or k in NUZHA_PARTS)
    print(f"{len(fb)} Fath al-Bari pieces in {max((l['n'] for l in fb), default=0)} lessons (the site lists 1,224 pieces) + {len(data['lessons']) - len(fb)} Nuzhat pieces -> {a.out}")
    print(f"total size of these files: {sizes / 1e9:.2f} GB")
    for l in fb[:3] + fb[len(fb) // 2: len(fb) // 2 + 2] + fb[-3:]: print(f"   #{l['n']:>5}  {l['title']}   [{l.get('section', '-')}]  {l.get('hd', 'no date')}")
    for l in data["lessons"][len(fb):]: print(f"   Nuzhat  {l['title']}")
    print(f"with Hijri date: {sum(1 for l in fb if l.get('hd'))} of {len(fb)}; with a book section: {sum(1 for l in fb if l.get('section'))} of {len(fb)}; lessons made of several pieces: {len(fb) - len({l['n'] for l in fb})} extra pieces")
    if problems:
        print(f"\n{len(problems)} lessons skipped:"); [print("  ", p) for p in problems[:15]]
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
