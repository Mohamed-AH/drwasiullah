#!/usr/bin/env python3
"""Look at the Sheikh's page on makkahscholars.org and report what is there (run on YOUR machine; the cloud session cannot reach the site).

    python tools/probe_makkah.py                                   # the four lesson groups of scholar 39 (group_id 32-35)
    python tools/probe_makkah.py --max-pages 600 --delay 1.5
    python tools/probe_makkah.py --url "https://makkahscholars.org/lessons?scholar_id=39&group_id=32"   # one group only

Stays inside what was asked: the group listing pages, their pagination (the same listing with another page number) and the lesson pages they link to
(--detail pattern). It never wanders to other scholars or other parts of the site.
Read-only and polite: honours robots.txt, identifies itself, waits between requests, fetches at most --max-pages pages of that site.
It saves the HTML it fetched to tools/makkah_pages/ and writes tools/makkah_report.txt: the page titles and headings, the links grouped by section
of the site, and every media file it finds (audio/video/PDF) grouped by host and type. Send me the report (or zip the folder) and I will design the
import: what the lessons are, how they are grouped, whether the files are direct downloads (so they can be linked, sized and later mirrored).
Standard library only."""
import argparse, collections, re, sys, time, urllib.parse, urllib.request, urllib.robotparser
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "drwasiullah-site-probe/1.0 (+https://drwasiullah.com)"
MEDIA = re.compile(r"\.(mp3|m4a|aac|ogg|wav|mp4|webm|m3u8|pdf)(\?|#|$)", re.I)


class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.links, self.media, self.heads, self.title, self._in = [], [], [], "", None
    def handle_starttag(self, tag, a):
        a = dict(a)
        for k in ("href", "src", "data-src", "data-url", "data-audio", "data-file"):
            v = a.get(k)
            if not v or v.startswith(("#", "javascript:", "mailto:", "tel:", "data:")): continue
            (self.media if (MEDIA.search(v) or tag in ("audio", "source", "video")) else self.links).append(v)
        if tag in ("title", "h1", "h2", "h3", "h4"): self._in = tag; self._buf = []
    def handle_data(self, d):
        if self._in: self._buf.append(d)
    def handle_endtag(self, tag):
        if self._in == tag:
            t = re.sub(r"\s+", " ", "".join(self._buf)).strip(); self._in = None
            if tag == "title": self.title = t
            elif t: self.heads.append((tag, t))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", action="append", help="listing page to start from (repeatable); default: the four groups of scholar 39")
    ap.add_argument("--detail", default=r"^/lessons?/\d+", help="regex for lesson pages (on the path) that are followed from a listing")
    ap.add_argument("--max-pages", type=int, default=300)
    ap.add_argument("--delay", type=float, default=1.0)
    a = ap.parse_args()
    seeds = a.url or [f"https://makkahscholars.org/lessons?scholar_id=39&group_id={g}" for g in (32, 33, 34, 35)]
    start = urllib.parse.urlsplit(seeds[0]); host = start.netloc
    seed_paths = {urllib.parse.urlsplit(u).path for u in seeds}
    seed_keys = {u: urllib.parse.parse_qs(urllib.parse.urlsplit(u).query).get("group_id", ["?"])[0] for u in seeds}
    group_of = {}        # url -> group id it was reached from
    rp = urllib.robotparser.RobotFileParser(f"{start.scheme}://{host}/robots.txt")
    try: rp.read()
    except Exception: pass
    out_dir = ROOT / "tools" / "makkah_pages"; out_dir.mkdir(parents=True, exist_ok=True)
    queue, seen, pages, media = list(seeds), set(), {}, collections.defaultdict(set)
    by_group = collections.defaultdict(set)
    for u in seeds: group_of[u] = seed_keys[u]
    while queue and len(pages) < a.max_pages:
        url = queue.pop(0).split("#")[0]
        if url in seen: continue
        seen.add(url)
        if not rp.can_fetch(UA, url): print("robots.txt disallows", url, file=sys.stderr); continue
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ar,en"}), timeout=30) as r:
                html = r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")
        except Exception as e:
            print("failed", url, e, file=sys.stderr); continue
        (out_dir / (re.sub(r"[^\w]+", "_", url)[-120:] + ".html")).write_text(html, encoding="utf-8")
        p = Page(); p.feed(html); pages[url] = p
        g = group_of.get(url, "?")
        for m in p.media:
            full = urllib.parse.urljoin(url, m); media[urllib.parse.urlsplit(full).netloc].add(full); by_group[g].add(full)
        for l in p.links:
            full = urllib.parse.urljoin(url, l).split("#")[0]; sp = urllib.parse.urlsplit(full); q = urllib.parse.parse_qs(sp.query)
            if sp.netloc != host or full in seen or full in queue: continue
            same_listing = sp.path in seed_paths and q.get("scholar_id") == ["39"] and q.get("group_id", [g])[0] == g   # pagination of this group
            is_detail = re.search(a.detail, sp.path) is not None
            if same_listing or is_detail:
                group_of.setdefault(full, g); queue.append(full)
        print(f"  [{len(pages)}] {url}  ({len(p.media)} media, {len(p.links)} links)", file=sys.stderr)
        time.sleep(a.delay)

    rep = [f"start: {', '.join(seeds)}", f"pages fetched: {len(pages)}"]
    rep += [f"group {g}: {len(m)} media files found" for g, m in sorted(by_group.items())] + [""]
    for url, p in pages.items():
        rep.append(f"== {url}\n   title: {p.title}")
        for tag, t in p.heads[:12]: rep.append(f"   {tag}: {t[:100]}")
        secs = collections.Counter(urllib.parse.urlsplit(urllib.parse.urljoin(url, l)).path.strip("/").split("/")[0] for l in p.links if urllib.parse.urlsplit(urllib.parse.urljoin(url, l)).netloc == host)
        rep.append("   internal link sections: " + ", ".join(f"{k or '/'}x{v}" for k, v in secs.most_common(8)))
    rep += ["", "== MEDIA FILES BY HOST"]
    for h, urls in sorted(media.items(), key=lambda kv: -len(kv[1])):
        ext = collections.Counter(re.search(r"\.(\w+)(\?|#|$)", u).group(1).lower() if re.search(r"\.(\w+)(\?|#|$)", u) else "?" for u in urls)
        rep.append(f"{h}: {len(urls)} files {dict(ext)}")
        for u in sorted(urls)[:6]: rep.append(f"     {u}")
    text = "\n".join(rep)
    (ROOT / "tools" / "makkah_report.txt").write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
