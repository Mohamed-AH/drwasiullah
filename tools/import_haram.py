#!/usr/bin/env python3
"""One-time import of the Sheikh's lessons from the Haram guidance channel (@twjehDM) -> site/data/haram.json. Run on YOUR machine (needs YOUTUBE_API_KEY in .env).

    python tools/import_haram.py              # reads data/haram_curation.json, asks YouTube for each video's length, writes site/data/haram.json
    python tools/import_haram.py --no-api     # no lengths (offline); the site then shows no hours for these series

data/haram_curation.json is the hand-curated list (which videos, which series, titles, lesson numbers, Hijri dates from the titles). It was made from the
output of find_channel_lessons.py and reviewed by a person: only videos whose title names the Sheikh. Nothing here is refreshed automatically.
For each video the API gives the real duration; a video that YouTube no longer returns (deleted/private) or that has no length yet (live now) is left out and
listed. Videos that cannot be embedded are kept (the lesson page links to YouTube) but listed. Nothing is downloaded from YouTube: metadata only.
scripts/build.mjs merges haram.json into the library the browsers load (like makkah.json). Standard library only."""
import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import ingest                                  # .env loader, API helper
from build_catalogue import duration           # ISO 8601 -> seconds

CUR = ROOT / "data" / "haram_curation.json"
OUT = ROOT / "site" / "data" / "haram.json"


def fetch(ids):
    """video id -> {'seconds', 'embeddable'} for the ids YouTube returns."""
    out = {}
    for batch in ingest.chunks(ids, 50):
        data = ingest.api_get("videos", {"part": "contentDetails,status", "id": ",".join(batch), "maxResults": 50})
        for v in data.get("items", []):
            out[v["id"]] = {"seconds": duration(v.get("contentDetails", {}).get("duration", "")), "embeddable": v.get("status", {}).get("embeddable", True)}
    return out


def build(cur, info):
    """-> (library dict, report lines). info = None means no API (no durations, nothing checked)."""
    lessons, report = [], []
    for v in cur["videos"]:
        meta = (info or {}).get(v["id"])
        if info is not None:
            if meta is None: report.append(f"LEFT OUT (deleted/private?): {v['id']}  {v['title']}"); continue
            if meta["seconds"] == 0: report.append(f"LEFT OUT (live now / no length yet): {v['id']}  {v['title']}"); continue
            if not meta["embeddable"]: report.append(f"not embeddable (kept; the page links to YouTube): {v['id']}  {v['title']}")
        l = {"id": v["id"], "title": v["title"], "series": v["series"], "kind": "video", "date": v["date"]}
        for k in ("n", "hd", "section"):
            if v.get(k): l[k] = v[k]
        if meta: l["duration"] = meta["seconds"]
        lessons.append(l)
    used = {l["series"] for l in lessons}
    return {"series": [s for s in cur["series"] if s["id"] in used], "lessons": lessons}, report


def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument("--no-api", action="store_true"); ap.add_argument("--curation", default=str(CUR)); ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args(argv)
    cur = json.loads(Path(a.curation).read_text(encoding="utf-8"))
    ids = [v["id"] for v in cur["videos"]]
    assert len(ids) == len(set(ids)), "duplicate video ids in the curation file"
    assert all(v["series"] in {s["id"] for s in cur["series"]} for v in cur["videos"]), "a video names an unknown series"
    info = None
    if not a.no_api:
        ingest.load_dotenv(ingest.ENV_PATH)
        info = fetch(ids)
    lib, report = build(cur, info)
    Path(a.out).write_text(json.dumps(lib, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    hours = sum(l.get("duration", 0) for l in lib["lessons"]) / 3600
    print(f"{len(lib['lessons'])} of {len(ids)} lessons in {len(lib['series'])} series -> {a.out}" + (f"   ({hours:.1f} hours)" if info else "   (no lengths)"))
    for s in lib["series"]: print(f"   {s['id']:22} {sum(1 for l in lib['lessons'] if l['series'] == s['id']):3}  {s['title']}")
    for r in report: print("  ", r)
    return 1 if report and info is not None and any(r.startswith("LEFT OUT") for r in report) else 0


if __name__ == "__main__":
    sys.exit(main())
