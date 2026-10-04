#!/usr/bin/env python3
"""Turn the scan of makkahscholars.org (tools/makkah_scan.json, made by scan_makkah.py) into site/data/makkah.json.

    python tools/scan_makkah.py && python tools/import_makkah.py        # then commit site/data/makkah.json

Creates the audio series «شرح فتح الباري» from group 33 (1,224 lessons) and adds the last two Nuzhat pieces (lessons 3727, 3728) to our existing
Nuzhat audio series as lessons 22 and 23. Titles come from the file names on the source site; lessons are linked straight to the source's mp3 files
(mirroring to our own storage can come later with tools/mirror_media.py, which reads makkah.json too). Prints a summary and a sample of titles to check."""
import argparse, json, re, sys, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / "makkah_scan.json"
OUT = ROOT / "site" / "data" / "makkah.json"
SERIES = {"id": "fath-bari", "title": "شرح فتح الباري", "sec": "audio", "description": "تسجيلات صوتية لشرح الشيخ لفتح الباري.", "unit": "الدرس", "ordered": True}
NUZHA_EXTRA = {"3727": 22, "3728": 23}          # makkahscholars lesson number -> lesson number in our series nuzha-audio
PART = {"a": " — الجزء الأول", "b": " — الجزء الثاني"}


def clean_url(u):
    sp = urllib.parse.urlsplit(u)
    if sp.scheme != "https": raise ValueError(f"not https: {u}")
    return urllib.parse.urlunsplit((sp.scheme, sp.netloc, urllib.parse.quote(urllib.parse.unquote(sp.path), safe="/"), "", ""))


def build(cache):
    lessons, problems, seq = [], [], 0
    for key in sorted((k for k, v in cache.items() if v.get("group") == "33"), key=int):
        v = cache[key]
        if v.get("error") or not v.get("url"): problems.append(f"{key}: {v.get('error', 'no url')}"); continue
        seq += 1
        n = v.get("num") or seq
        title = (v.get("title") or "").strip() or f"الدرس {n}"
        if v.get("part") in PART: title += PART[v["part"]]
        lessons.append({"id": f"fath-bari-{int(key):04d}", "title": title, "series": "fath-bari", "kind": "audio", "src": clean_url(v["url"]), "n": n})
    for key, n in NUZHA_EXTRA.items():
        v = cache.get(key)
        if not v or v.get("error") or not v.get("url"): problems.append(f"{key} (Nuzhat): {(v or {}).get('error', 'not scanned')}"); continue
        lessons.append({"id": f"nuzha-audio-{n:04d}", "title": f"الدرس {n}", "series": "nuzha-audio", "kind": "audio", "src": clean_url(v["url"]), "n": n})
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
    sizes = sum(v.get("size") or 0 for k, v in cache.items() if v.get("group") == "33" or k in NUZHA_EXTRA)
    print(f"{len(fb)} Fath al-Bari lessons (expected 1224) + {len(data['lessons']) - len(fb)} Nuzhat lessons -> {a.out}")
    print(f"total size of these files: {sizes / 1e9:.2f} GB")
    for l in fb[:3] + fb[len(fb) // 2: len(fb) // 2 + 2] + fb[-3:]: print(f"   #{l['n']:>5}  {l['title']}   <- {urllib.parse.unquote(l['src'])[-70:]}")
    nums = [l["n"] for l in fb]
    dup = sorted({n for n in nums if nums.count(n) > 1})
    if dup: print(f"note: {len(dup)} lesson numbers appear twice (parts a/b?), e.g. {dup[:5]}")
    if problems:
        print(f"\n{len(problems)} lessons skipped:"); [print("  ", p) for p in problems[:15]]
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
