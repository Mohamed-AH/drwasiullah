#!/usr/bin/env python3
"""Check that every audio file and PDF on the site really downloads (run where archive.org is reachable).

    python tools/check_links.py                    # all audio + PDFs in site/data/library.json
    python tools/check_links.py --workers 8        # faster
    python tools/check_links.py --only ibn-salah   # only series/books whose id or title contains this
    python tools/check_links.py --retries 4        # more attempts before calling a 5xx "failing"

For each URL it follows redirects to the final CDN node and requests the first bytes with a ranged GET
(HEAD alone says OK for files that fail on download), then checks status 200/206, a media-looking
Content-Type (not an HTML error page) and that bytes arrive. 5xx / timeouts are retried with backoff.

Verdicts:  OK  |  DEAD (404/410 - gone)  |  FAILING (still 5xx / timeout / bad content after retries)  |  BLOCKED (401/403/429)
Writes tools/link_report.json (everything) and tools/missing.txt (DEAD only, same format as measure_storage.py),
so `python import_wordpress.py --prune tools/missing.txt` records only persistent 404/410 in dead_links.txt.
FAILING links are NOT pruned: re-run later - archive.org nodes recover. Exit code 1 if anything is not OK. Standard library only.
"""
import argparse, json, sys, time, urllib.request, urllib.error, urllib.parse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import load_library   # library.json + makkah.json

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "drwasiullah-link-check/1.0", "Range": "bytes=0-1023"}
GOOD = {"audio": ("audio/", "video/", "application/octet-stream", "binary/"), "pdf": ("application/pdf", "application/octet-stream", "binary/")}


def probe(url, kind, timeout=30, retries=3):
    """-> (verdict, detail, final_host)."""
    detail, host = "", ""
    for attempt in range(retries):
        if attempt: time.sleep(2 ** attempt)           # 2s, 4s, 8s ...
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                host = urllib.parse.urlsplit(r.geturl()).netloc
                ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                body = r.read(1024)
                if r.status not in (200, 206): detail = f"HTTP {r.status}"; continue
                if not ctype.startswith(GOOD[kind]): detail = f"unexpected Content-Type {ctype or '(none)'}"; continue
                if not body: detail = "empty body"; continue
                if kind == "pdf" and not body.startswith(b"%PDF"): detail = "not a PDF (bad header)"; continue
                return "OK", f"{r.status} {ctype}", host
        except urllib.error.HTTPError as e:
            host = urllib.parse.urlsplit(e.geturl() or url).netloc
            if e.code in (404, 410): return "DEAD", f"HTTP {e.code}", host
            if e.code in (401, 403, 429): return "BLOCKED", f"HTTP {e.code}", host
            detail = f"HTTP {e.code}"
        except Exception as e:
            detail = type(e).__name__ + (f": {e}" if str(e) else "")
    return "FAILING", detail, host


def collect(lib, cat, only):
    series = {s["id"]: s["title"] for s in lib["series"]}
    if cat: series.update({s["id"]: s["title"] for s in cat["series"]})
    items = []   # (url, kind, group, label)
    for l in lib["lessons"]:
        if l.get("src"): items.append((l["src"], "audio", series.get(l["series"], l["series"]), f'{l["series"]}: {l.get("title", "")}'))
    for b in lib.get("books", []):
        for f in b["files"]: items.append((f["url"], "pdf", b.get("group", "books"), b.get("title", "")))
    if only: items = [i for i in items if only in i[2] or only in i[3] or only in i[0]]
    seen, out = set(), []
    for it in items:
        if it[0] not in seen: seen.add(it[0]); out.append(it)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--library", default=str(ROOT / "site" / "data" / "library.json"))
    ap.add_argument("--catalogue", default=str(ROOT / "site" / "catalogue.json"))
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--timeout", type=int, default=30)
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default=str(ROOT / "tools"))
    a = ap.parse_args()

    lib = load_library(a.library)
    cp = Path(a.catalogue)
    items = collect(lib, json.loads(cp.read_text(encoding="utf-8")) if cp.exists() else None, a.only)
    print(f"checking {len(items)} files ...", file=sys.stderr)

    def work(it): return probe(it[0], it[1], a.timeout, a.retries)
    results = []
    with ThreadPoolExecutor(a.workers) as ex:
        for i, (it, res) in enumerate(zip(items, ex.map(work, items)), 1):
            results.append({"url": it[0], "kind": it[1], "group": it[2], "label": it[3], "verdict": res[0], "detail": res[1], "host": res[2]})
            if res[0] != "OK": print(f"  {res[0]:8} {res[1]:28} {it[0]}", file=sys.stderr)
            if i % 100 == 0: print(f"  {i}/{len(items)}", file=sys.stderr)

    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / "link_report.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    dead = [r for r in results if r["verdict"] == "DEAD"]
    (out / "missing.txt").write_text("\n".join(f'{r["detail"]}\t{r["group"]}\t{r["url"]}' for r in dead), encoding="utf-8")

    by = defaultdict(lambda: defaultdict(int))
    for r in results: by[r["group"]][r["verdict"]] += 1
    print(f"\n{'series':56} {'OK':>5} {'DEAD':>5} {'FAIL':>5} {'BLOCK':>5}")
    for g, c in sorted(by.items(), key=lambda kv: -(kv[1]['DEAD'] + kv[1]['FAILING'])):
        print(f"{g[:56]:56} {c['OK']:5} {c['DEAD']:5} {c['FAILING']:5} {c['BLOCKED']:5}")
    tot = defaultdict(int)
    for r in results: tot[r["verdict"]] += 1
    print("\nTOTAL " + "  ".join(f"{k} {v}" for k, v in sorted(tot.items())))
    hosts = defaultdict(int)
    for r in results:
        if r["verdict"] == "FAILING": hosts[r["host"]] += 1
    if hosts: print("failing CDN nodes: " + ", ".join(f"{h} x{n}" for h, n in sorted(hosts.items(), key=lambda kv: -kv[1])))
    if dead: print(f"{len(dead)} DEAD -> {out / 'missing.txt'}   (python import_wordpress.py --prune tools/missing.txt)")
    if tot["FAILING"]: print("FAILING links are not pruned: re-run later (archive.org nodes recover) or re-upload the file; see link_report.json")
    sys.exit(0 if len(results) == tot["OK"] else 1)


if __name__ == "__main__":
    main()
