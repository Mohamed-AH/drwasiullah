#!/usr/bin/env python3
"""Health check for the live site. Free, no accounts: runs from GitHub Actions (.github/workflows/health.yml) or by hand.

    python tools/health_check.py                          # https://drwasiullah.com, full check
    python tools/health_check.py --base http://localhost:8000 --skip-external     # a local build: pages + data only
    python tools/health_check.py --media 6 --youtube 3    # sample sizes

Checks (each prints OK or FAIL; exit code 1 if any FAIL, so a scheduled run turns red and GitHub emails the owner):
  pages     home, sitemap, robots, bio, books, a few series and lessons answer 200 and contain the expected text
  data      /data/library.json and /catalogue.json parse and hold a sane number of lessons (a half-written build would not)
  headers   Content-Security-Policy is present on pages
  media     a random sample of audio/PDF files on media.drwasiullah.com answer a ranged request, and CORS allows the site's origin
  youtube   a random sample of video lessons still exist (YouTube oEmbed, no API key)
Standard library only. Sample sizes are small on purpose: this is a smoke test, not a link audit (see tools/check_links.py for that)."""
import argparse, json, random, re, sys, urllib.error, urllib.parse, urllib.request

UA = {"User-Agent": "drwasiullah-health-check/1.0"}
FAILS = []


def get(url, headers=None, timeout=25, read=2_000_000):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read(read)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), b""
    except Exception as e:
        return 0, {}, str(e).encode()


def check(name, ok, detail=""):
    print(f"  {'OK  ' if ok else 'FAIL'} {name}" + (f"   {detail}" if detail and not ok else ""))
    if not ok: FAILS.append(name)
    return ok


def text(b): return b.decode("utf-8", "replace")


def pages(base):
    print("pages")
    must = [("/", "وصي الله"), ("/sitemap.xml", "<urlset"), ("/robots.txt", "Sitemap"), ("/about/", "الشيخ"), ("/books/", "الكتب"),
            ("/series/muslim/", "شرح صحيح مسلم"), ("/series/tadrib/", "تدريب الراوي"), ("/lesson/tadrib-0002/", "<audio"), ("/section/duroos/", "الدروس")]
    sitemap = None
    for path, word in must:
        st, hd, body = get(base + path)
        check(f"{path} -> {st}", st == 200 and word in text(body), f"expected 200 with {word!r}")
        if path == "/sitemap.xml" and st == 200: sitemap = text(body)
        if path == "/":
            check("Content-Security-Policy header on /", "Content-Security-Policy" in hd or "content-security-policy" in {k.lower() for k in hd}, "header missing (site/_headers not applied?)")
    if sitemap is not None:
        n = sitemap.count("<loc>")
        check(f"sitemap lists {n} URLs (expected >= 2000)", n >= 2000)
    st, _, _ = get(base + "/definitely-not-a-page/")
    check(f"unknown page -> {st} (expected 404)", st == 404)


def data(base):
    print("data")
    st, _, body = get(base + "/data/library.json", read=50_000_000)
    lib = None
    if check(f"/data/library.json -> {st}", st == 200):
        try: lib = json.loads(body)
        except Exception as e: check("library.json parses", False, str(e))
    if lib:
        check(f"library holds {len(lib.get('lessons', []))} lessons (expected >= 2000)", len(lib.get("lessons", [])) >= 2000)
        check(f"library holds {len(lib.get('books', []))} books (expected >= 20)", len(lib.get("books", [])) >= 20)
    st, _, body = get(base + "/catalogue.json", read=50_000_000)
    cat = None
    if check(f"/catalogue.json -> {st}", st == 200):
        try: cat = json.loads(body)
        except Exception as e: check("catalogue.json parses", False, str(e))
    if cat:
        check(f"catalogue holds {len(cat.get('lessons', []))} video lessons (expected >= 900)", len(cat.get("lessons", [])) >= 900)
    return lib, cat


def media(lib, n, rng):
    print("media")
    if not lib: return check("media sample (library unavailable)", False)
    ours = [l["src"] for l in lib["lessons"] if l.get("src", "").startswith("https://media.drwasiullah.com/")]
    pdfs = [f["url"] for b in lib.get("books", []) for f in b["files"] if f["url"].startswith("https://media.drwasiullah.com/")]
    check(f"{len(ours)} audio files and {len(pdfs)} PDFs are served from media.drwasiullah.com (expected >= 1000 audio)", len(ours) >= 1000)
    for url in rng.sample(ours, min(n, len(ours))) + rng.sample(pdfs, min(2, len(pdfs))):
        st, hd, body = get(url, {"Range": "bytes=0-1023", "Origin": "https://www.drwasiullah.com"}, read=1024)
        low = {k.lower(): v for k, v in hd.items()}
        ok = st in (200, 206) and len(body) > 0 and low.get("access-control-allow-origin") in ("https://www.drwasiullah.com", "*")
        why = f"HTTP {st}" if st not in (200, 206) else ("empty body" if not body else f"no CORS header (purge the Cloudflare cache? see docs/mirror-setup.md)")
        check(url.replace("https://media.drwasiullah.com", "media"), ok, why)


def youtube(cat, n, rng):
    print("youtube")
    if not cat: return check("youtube sample (catalogue unavailable)", False)
    for l in rng.sample(cat["lessons"], min(n, len(cat["lessons"]))):
        u = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={l['id']}", safe="")
        st, _, _ = get(u)
        check(f"video {l['id']} ({l['series']}) -> {st}", st == 200, "removed/private on YouTube?" if st in (401, 403, 404) else f"HTTP {st}")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://drwasiullah.com")
    ap.add_argument("--media", type=int, default=6, help="audio files to sample")
    ap.add_argument("--youtube", type=int, default=3, help="video lessons to sample")
    ap.add_argument("--skip-external", action="store_true", help="skip the media and YouTube checks (for a local build)")
    ap.add_argument("--seed", type=int, default=None)
    a = ap.parse_args(argv)
    base = a.base.rstrip("/"); rng = random.Random(a.seed)
    print(f"health check of {base}")
    pages(base)
    lib, cat = data(base)
    if not a.skip_external:
        media(lib, a.media, rng); youtube(cat, a.youtube, rng)
    print()
    if FAILS:
        print(f"{len(FAILS)} problem(s):"); [print("  -", f) for f in FAILS]; return 1
    print("all checks passed"); return 0


if __name__ == "__main__":
    sys.exit(main())
