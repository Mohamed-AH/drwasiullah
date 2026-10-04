#!/usr/bin/env python3
"""Look at the Sheikh's page on makkahscholars.org and report what is there (run on YOUR machine; the cloud session cannot reach the site).

    python tools/probe_makkah.py                                   # https://makkahscholars.org/scholars/39, this page + pages it links to
    python tools/probe_makkah.py --max-pages 60 --delay 1.5

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
    ap.add_argument("--url", default="https://makkahscholars.org/scholars/39")
    ap.add_argument("--max-pages", type=int, default=40)
    ap.add_argument("--delay", type=float, default=1.0)
    a = ap.parse_args()
    start = urllib.parse.urlsplit(a.url); host = start.netloc
    rp = urllib.robotparser.RobotFileParser(f"{start.scheme}://{host}/robots.txt")
    try: rp.read()
    except Exception: pass
    out_dir = ROOT / "tools" / "makkah_pages"; out_dir.mkdir(parents=True, exist_ok=True)
    queue, seen, pages, media = [a.url], set(), {}, collections.defaultdict(set)
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
        for m in p.media: media[urllib.parse.urlsplit(urllib.parse.urljoin(url, m)).netloc].add(urllib.parse.urljoin(url, m))
        for l in p.links:
            full = urllib.parse.urljoin(url, l)
            if urllib.parse.urlsplit(full).netloc == host and full.split("#")[0] not in seen: queue.append(full)
        print(f"  [{len(pages)}] {url}  ({len(p.media)} media, {len(p.links)} links)", file=sys.stderr)
        time.sleep(a.delay)

    rep = [f"start: {a.url}", f"pages fetched: {len(pages)}", ""]
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
