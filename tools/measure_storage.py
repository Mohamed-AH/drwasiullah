#!/usr/bin/env python3
"""Measure how much storage the Sheikh's audio + PDFs need (run on a machine that can reach archive.org).

    python tools/measure_storage.py                 # reads site/data/library.json, ~1,100 HEAD requests
    python tools/measure_storage.py --workers 8     # faster
    python tools/measure_storage.py --refresh       # ignore the cache

Sends only HEAD requests (falls back to a 1-byte ranged GET) - nothing is downloaded.
Results are cached in tools/.sizes.json so an interrupted run resumes. Standard library only.
"""
import argparse, json, sys, urllib.request, urllib.error
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import load_library   # library.json + makkah.json

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).with_name(".sizes.json")
UA = {"User-Agent": "drwasiullah-storage-audit/1.0"}


def size_of(url, timeout=30):
    """-> (bytes, None) on success or (None, reason) e.g. 'HTTP 404', 'timeout'."""
    why = "no Content-Length"
    for attempt in range(2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, method="HEAD", headers=UA), timeout=timeout) as r:
                n = r.headers.get("Content-Length")
                if n and n.isdigit() and int(n) > 0: return int(n), None
        except urllib.error.HTTPError as e:
            why = f"HTTP {e.code}"
        except Exception as e:
            why = type(e).__name__
        try:  # some servers refuse HEAD: ask for one byte and read Content-Range: bytes 0-0/TOTAL
            req = urllib.request.Request(url, headers={**UA, "Range": "bytes=0-0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                cr = r.headers.get("Content-Range", "")
                if "/" in cr and cr.rsplit("/", 1)[1].isdigit(): return int(cr.rsplit("/", 1)[1]), None
                n = r.headers.get("Content-Length")
                if n and n.isdigit(): return int(n), None
        except urllib.error.HTTPError as e:
            why = f"HTTP {e.code}"
        except Exception as e:
            why = type(e).__name__
        if why.startswith("HTTP 4"): break          # 404/403: retrying won't help
    return None, why


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--library", default=str(ROOT / "site" / "data" / "library.json"))
    ap.add_argument("--catalogue", default=str(ROOT / "site" / "catalogue.json"))
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()

    lib = load_library(a.library)
    items = []   # (url, kind, group)
    series = {s["id"]: s for s in lib["series"]}
    cat = Path(a.catalogue)   # some lessons (e.g. Arabic lectures) belong to series defined in the YouTube catalogue
    if cat.exists(): series.update({s["id"]: s for s in json.loads(cat.read_text(encoding="utf-8"))["series"]})
    for l in lib["lessons"]:
        if l.get("src"): items.append((l["src"], "audio", series.get(l["series"], {}).get("title", l["series"]), l.get("duration", 0)))
    for b in lib.get("books", []):
        for f in b["files"]: items.append((f["url"], "pdf", b.get("group", "books"), 0))

    cache = {} if a.refresh or not CACHE.exists() else json.loads(CACHE.read_text())
    todo = sorted({u for u, *_ in items if not isinstance(cache.get(u), int)})   # failures are retried on every run
    print(f"{len(items)} files, {len(todo)} to measure ...", file=sys.stderr)
    with ThreadPoolExecutor(a.workers) as ex:
        for i, (u, (n, why)) in enumerate(zip(todo, ex.map(size_of, todo)), 1):
            cache[u] = n if n is not None else f"ERR: {why}"
            if i % 50 == 0 or i == len(todo):
                CACHE.write_text(json.dumps(cache)); print(f"  {i}/{len(todo)}", file=sys.stderr)

    tot, cnt, miss = defaultdict(int), defaultdict(int), []
    for u, kind, group, _ in items:
        n = cache.get(u)
        if not isinstance(n, int): miss.append((u, n or "ERR: unknown", group)); continue
        tot[(kind, group)] += n; cnt[(kind, group)] += 1
    gb = lambda b: b / 1e9
    print(f"\n{'type':6} {'group':58} {'files':>5} {'GB':>8}")
    for (kind, group), b in sorted(tot.items(), key=lambda kv: -kv[1]):
        print(f"{kind:6} {group[:58]:58} {cnt[(kind, group)]:5} {gb(b):8.2f}")
    for kind in ("audio", "pdf"):
        b = sum(v for (k, _), v in tot.items() if k == kind); n = sum(v for (k, _), v in cnt.items() if k == kind)
        print(f"\nTOTAL {kind:5} {n:5} files  {gb(b):8.2f} GB" + (f"   avg {b / n / 1e6:.1f} MB/file" if n else ""))
    allb = sum(tot.values())
    print(f"TOTAL ALL    {sum(cnt.values()):5} files  {gb(allb):8.2f} GB   (Cloudflare R2 free tier: 10 GB; beyond that ~US$0.015/GB-month)")
    if miss:
        out = ROOT / "tools" / "missing.txt"
        out.write_text("\n".join(f"{why}\t{group}\t{u}" for u, why, group in miss), encoding="utf-8")
        reasons = defaultdict(int)
        for _, why, _ in miss: reasons[why] += 1
        print(f"\n{len(miss)} files could NOT be measured: " + ", ".join(f"{k} x{v}" for k, v in reasons.items()))
        by_group = defaultdict(int)
        for _, _, g in miss: by_group[g] += 1
        for g, n in sorted(by_group.items(), key=lambda kv: -kv[1]): print(f"   {n:3}  {g}")
        print(f"   full list (reason, series, url) -> {out.relative_to(ROOT)}   (HTTP 404 = dead link at the source)")


if __name__ == "__main__":
    main()
