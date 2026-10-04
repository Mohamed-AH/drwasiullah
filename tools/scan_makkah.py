#!/usr/bin/env python3
"""List the Sheikh's lessons on makkahscholars.org (scholar 39) with their real file URLs and sizes. Run on YOUR machine. Downloads NO audio.

    python tools/scan_makkah.py --sample 5          # first 5 lessons of each group: check it works (about 40 requests)
    python tools/scan_makkah.py                      # everything: 1,550 lessons, resumable (about 30 minutes at the default pace)
    python tools/scan_makkah.py --group 34           # one group only

For each lesson number it asks https://makkahscholars.org/lessons/<n>/download where the file is (reading only the redirect, never the body), then asks the
file host for the size with a HEAD request. Results go to tools/makkah_scan.json (a cache: an interrupted run continues) and a summary is printed:
files, total size in GB, and example names per group, so we can decide what to link and whether mirroring fits the storage budget.
Lesson numbers per group (observed on the site): 32 = 2179-2398 (220), 33 = 2399-3622 (1,224), 34 = 3623-3678 (56), 35 = 3679-3728 (50).
Polite: identifies itself, honours robots.txt, waits between requests. Standard library only."""
import argparse, json, re, sys, time, urllib.error, urllib.parse, urllib.request, urllib.robotparser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / "makkah_scan.json"
UA = "drwasiullah-site-scan/1.0 (+https://drwasiullah.com)"
BASE = "https://makkahscholars.org"
GROUPS = {"32": (2179, 2398), "33": (2399, 3622), "34": (3623, 3678), "35": (3679, 3728)}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None          # we want the Location header, not the file


OPEN = urllib.request.build_opener(NoRedirect)


def locate(base, n, timeout=30):
    """-> (file_url, content_length_or_None, content_type). Reads headers only."""
    url = f"{base}/lessons/{n}/download"
    try:
        r = OPEN.open(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout)
        try: return url, int(r.headers.get("Content-Length") or 0) or None, r.headers.get_content_type()   # served directly: headers are enough
        finally: r.close()
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308) and e.headers.get("Location"):
            return urllib.parse.urljoin(url, e.headers["Location"]), None, ""
        raise


def head(url, timeout=30):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return int(r.headers.get("Content-Length") or 0) or None, r.headers.get_content_type()
    except urllib.error.HTTPError:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Range": "bytes=0-0"})        # some hosts refuse HEAD
        with urllib.request.urlopen(req, timeout=timeout) as r:
            cr = r.headers.get("Content-Range", "")
            return (int(cr.rsplit("/", 1)[1]) if "/" in cr and cr.rsplit("/", 1)[1].isdigit() else None), r.headers.get_content_type()


def parse_name(url):
    """File name -> (number, title, part): '0001معرفة السند في الحديث-مقدمةa.mp3' -> (1, 'معرفة السند في الحديث-مقدمة', 'a')."""
    stem = urllib.parse.unquote(urllib.parse.urlsplit(url).path.rsplit("/", 1)[-1]).rsplit(".", 1)[0]
    m = re.match(r"^\s*(\d+)\s*(.*?)\s*([ab])?$", stem)
    return (int(m.group(1)), m.group(2).strip(" -_"), m.group(3) or "") if m else (None, stem, "")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=BASE)
    ap.add_argument("--group", choices=sorted(GROUPS))
    ap.add_argument("--sample", type=int, default=0, help="only the first N lessons of each group")
    ap.add_argument("--delay", type=float, default=0.6)
    a = ap.parse_args(argv)
    rp = urllib.robotparser.RobotFileParser(a.base + "/robots.txt")
    try: rp.read()
    except Exception: pass
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    todo = []
    for g, (lo, hi) in GROUPS.items():
        if a.group and g != a.group: continue
        ids = list(range(lo, hi + 1))[: a.sample or None]
        todo += [(g, n) for n in ids]
    if not rp.can_fetch(UA, f"{a.base}/lessons/{todo[0][1]}/download"):
        sys.exit("robots.txt of the site disallows /lessons/<n>/download for automated clients; not scanning.")
    pending = [(g, n) for g, n in todo if str(n) not in cache or cache[str(n)].get("error")]
    print(f"{len(todo)} lessons selected, {len(pending)} to look up", file=sys.stderr)
    for i, (g, n) in enumerate(pending, 1):
        try:
            url, size, ctype = locate(a.base, n)
            if size is None or not ctype:
                time.sleep(a.delay / 2); size, ctype = head(url)
            num, title, part = parse_name(url)
            cache[str(n)] = {"group": g, "url": url, "size": size, "type": ctype, "num": num, "title": title, "part": part}
        except Exception as e:
            cache[str(n)] = {"group": g, "error": f"{type(e).__name__}: {e}"[:200]}
        if i % 25 == 0 or i == len(pending):
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8"); print(f"  {i}/{len(pending)}", file=sys.stderr)
        time.sleep(a.delay)

    print("\ngroup  lessons   with-size   total-GB   avg-MB   errors   non-audio")
    for g in sorted(GROUPS):
        rows = [v for k, v in cache.items() if v.get("group") == g]
        if not rows: continue
        ok = [r for r in rows if not r.get("error")]; sized = [r["size"] for r in ok if r.get("size")]
        non = [r for r in ok if not (r.get("type") or "").startswith(("audio/", "application/octet", "binary/"))]
        print(f"{g:>5}  {len(rows):7}  {len(sized):9}  {sum(sized) / 1e9:8.2f}  {(sum(sized) / len(sized) / 1e6 if sized else 0):7.1f}  {len(rows) - len(ok):7}  {len(non):9}")
        for r in ok[:3]: print(f"         e.g. #{r.get('num')} {r.get('part')} {r.get('title')}  <- {urllib.parse.unquote(r['url'])[:110]}")
    total = sum(r["size"] for r in cache.values() if r.get("size"))
    print(f"\nTOTAL {len(cache)} lessons, {total / 1e9:.2f} GB  ->  {CACHE.relative_to(ROOT)}")
    hosts = {urllib.parse.urlsplit(r["url"]).netloc for r in cache.values() if r.get("url")}
    print("file hosts:", ", ".join(sorted(hosts)))


if __name__ == "__main__":
    main()
