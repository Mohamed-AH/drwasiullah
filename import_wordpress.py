#!/usr/bin/env python3
"""Import the Sheikh's WordPress pages into site/data/library.json.

Usage:
    python import_wordpress.py PATH/TO/wasiwordpress     # folder of saved .html pages

Needs:  pip install beautifulsoup4 hijridate     (see requirements.txt)

What it reads (matched by page title):
  الدروس                     -> not parsed itself; its 9 series pages are
  شرح سنن الترمذي ... etc.   -> audio / Urdu series            (SERIES below)
  المحاضرات                  -> lectures (Arabic + Urdu)
  الخطب                      -> khutab
  الكتب والبحوث المختارة      -> books      (+ the Urdu books on the اردو page)
  اردو                       -> Urdu books / lectures

Dates: the source gives Hijri dates (in file names or titles) far more often than Gregorian
ones. They are stored as `hd` ("1433-03-02" or just "1426") and shown as-is by the site.
`date` (Gregorian, from the Hijri via Umm al-Qura) is only used for sorting.

Re-run any time; the output is fully regenerated.

Dead links:  python tools/check_links.py              # writes tools/missing.txt (HTTP 404 = dead at the source)
             python import_wordpress.py --prune tools/missing.txt
The second command adds the 404 URLs to dead_links.txt (commit it) and removes them from library.json right away;
later full imports keep skipping them. Delete a line from dead_links.txt if the source fixes the file.
"""
import html, json, re, sys
from pathlib import Path
from urllib.parse import unquote

try:
    from bs4 import BeautifulSoup
    from hijridate import Hijri
except ImportError:          # --prune works without them
    BeautifulSoup = Hijri = None

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "site" / "data" / "library.json"
DEAD = ROOT / "dead_links.txt"      # committed: URLs known to be 404 at the source; skipped on every import
AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

# page-title prefix -> series config.  sec: audio | urdu.  headings: use bold paragraphs as book/chapter groups.
SERIES = {
    "شرح سنن الترمذي": dict(id="tirmidhi", sec="audio", headings=True, unit="الدرس",
                           desc="تسجيلات صوتية لشرح الشيخ لسنن الترمذي، مرتبة بحسب الأبواب."),
    "شرح سنن أبي داود": dict(id="abu-dawud", sec="audio", headings=True, unit="الدرس",
                            desc="تسجيلات لشرح الشيخ لسنن أبي داود، مرتبة بحسب الكتب."),
    "تعليق على بعض كتاب الجامع": dict(id="jami-audio", sec="audio", headings=False, unit="الدرس", title="تعليق على كتاب الجامع لأخلاق الراوي وآداب السامع",
                                     desc="تعليق صوتي على بعض كتاب الجامع لأخلاق الراوي وآداب السامع للخطيب البغدادي."),
    "دروس من صحيح البخاري": dict(id="bukhari-audio", sec="audio", headings=True, unit="الدرس", title="دروس من صحيح البخاري — كتاب العلم",
                                desc="دروس صوتية من صحيح البخاري في كتاب العلم."),   # «كتاب الصلاة» (30 lessons) is dead at the source: see dead_links.txt
    "شرح نزهة النظر": dict(id="nuzha-audio", sec="audio", headings=False, unit="الدرس", title="شرح نزهة النظر في توضيح نخبة الفكر",
                          desc="شرح صوتي لنزهة النظر في توضيح نخبة الفكر للحافظ ابن حجر."),
    "شرح مقدمة ابن الصلاح": dict(id="ibn-salah", sec="audio", headings=False, unit="الدرس",
                                desc="شرح صوتي لمقدمة ابن الصلاح في علوم الحديث."),
    "شرح تدريب الراوي": dict(id="tadrib", sec="audio", headings=False, unit="الدرس",
                            desc="شرح صوتي لتدريب الراوي في شرح تقريب النواوي للسيوطي."),
    "شرح كتاب التوحيد (أردو)": dict(id="tawheed-urdu", sec="urdu", headings=False, unit="الدرس", title="شرح كتاب التوحيد (بالأردية)",
                                   desc="شرح كتاب التوحيد باللغة الأردية."),
    "شرح بلوغ المرام (أردو)": dict(id="bulugh-urdu", sec="urdu", headings=False, unit="الدرس", title="شرح بلوغ المرام (بالأردية)",
                                  desc="شرح بلوغ المرام من أدلة الأحكام باللغة الأردية."),
}
MEDIA = re.compile(r"\.(mp3|mp4|m4a)(\?|$)", re.I)
PDF = re.compile(r"\.pdf(\?|$)", re.I)


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(s or "").replace("\xa0", " ")).strip()


def fix_url(u):
    """Prefer stable https archive.org/download/ links over per-server mirrors / http."""
    u = u.strip().replace("&amp;", "&")
    m = re.match(r"https?://ia\d+\.us\.archive\.org/\d+/items/([^/]+)/(.+)$", u)
    if m: return f"https://archive.org/download/{m.group(1)}/{m.group(2)}"
    return re.sub(r"^http://(www\.)?archive\.org/", "https://archive.org/", u).replace("http://", "https://")


def body_of(soup):
    return soup.select_one(".entry-content") or soup.body


def page_title(path):
    return path.name.split(" _ ")[0].strip()


# ───────── dates ─────────
def hijri_to_greg(hd):
    p = [int(x) for x in hd.split("-")]
    y, m, d = (p + [1, 1])[:3]
    try:
        return Hijri(y, m, min(d, 29 if d > 29 else d)).to_gregorian().isoformat()
    except Exception:
        try: return Hijri(y, m, 1).to_gregorian().isoformat()
        except Exception: return ""


def valid_h(y, m, d):
    return 1300 <= y <= 1500 and 1 <= m <= 12 and 1 <= d <= 30


def date_from_filename(url):
    """-> (hd, gd) strings or ('','') — formats seen in the Sheikh's archive.org file names."""
    fn = unquote(url.rsplit("/", 1)[-1])
    H = lambda y, m, d: f"{int(y)}-{int(m)}-{int(d)}" if valid_h(int(y), int(m), int(d)) else ""
    pats = [
        (r"^(\d{4})(\d{2})(\d{2})\s*\[?(\d{4})(\d{2})(\d{2})\]?\s*[a-zA-Z]", True),        # 1437062820160406trm0802 / 14360207[20141129]trm0001
        (r"^(\d{4})\.(\d{2})\.(\d{2})\s*\[?(\d{4})\.?(\d{2})\.?(\d{2})\]?", True),            # 1433.03.022012.01.25Abd… / 1433.01.03[20111228]abd…
    ]
    for rx, has_g in pats:
        m = re.match(rx, fn)
        if m and H(*m.groups()[:3]):
            return H(*m.groups()[:3]), f"{m[4]}-{m[5]}-{m[6]}"
    m = re.match(r"^(20\d{2})(\d{2})(\d{2})\s*jm", fn)                                      # Jami: Gregorian only
    if m: return "", f"{m[1]}-{m[2]}-{m[3]}"
    for rx in (r"(?<!\d)(\d{1,2})-(\d{1,2})-(1[34]\d\d)(?!\d)",                              # Bulugh / Ibn al-Salah: d-m-Hy
               r"^[AB]?\d{4}(\d{1,2})-(\d{1,2})-(1[34]\d\d)(?!\d)"):                         # Bulugh: A003912-10-1423 (seq 0039, day 12)
        m = re.search(rx, fn)
        if m and H(m[3], m[2], m[1]): return H(m[3], m[2], m[1]), ""
    return "", ""


def date_from_title(t):
    """'... (1427.03.30)' / '(1426)' / '(1427.03)'  -> (title without the date, hd)"""
    m = re.search(r"\(\s*(1[34]\d\d)(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?\s*\)\s*$", t)
    if not m:   # date buried in a longer parenthetical: "(خطبة جمعة … – 1426.8.12)"
        m = re.search(r"\s*[–-]\s*(1[34]\d\d)\.(\d{1,2})\.(\d{1,2})\s*(?=\))", t)
        if not m: return t, ""
        return (t[:m.start()] + t[m.end():]).strip(), "-".join(str(int(x)) for x in m.groups())
    hd = "-".join(str(int(x)) for x in m.groups() if x)
    return t[:m.start()].strip(), hd


def stamp(item, hd, gd):
    if hd:
        item["hd"] = hd
        item["date"] = gd or hijri_to_greg(hd)
    elif gd:
        item["date"] = gd


# ───────── series pages ─────────
def is_heading(el):
    text = clean(el.get_text(" "))
    if not text or len(text) > 80 or text.startswith(("بقية", "ابتداء")): return False
    if any(MEDIA.search(a.get("href", "")) or "soundcloud" in a.get("href", "") for a in el.find_all("a")): return False
    strong = clean(" ".join(s.get_text(" ") for s in el.find_all(["strong", "b"]))) if el.name == "p" else text
    return bool(strong) and len(strong) >= 0.9 * len(text)


def parse_title(text, href):
    """-> (title, n or None)"""
    t = clean(text)
    m = re.fullmatch(r"\[\s*(\d+)\s*([ab])?\s*/\s*\d+\s*\]", t)
    if m:
        n = int(m[1]); part = {"a": " — الجزء الأول", "b": " — الجزء الثاني"}.get(m[2], "")
        return f"الدرس {n}{part}", n
    m = re.fullmatch(r"درس\s*(\d+)", t)
    if m: return f"الدرس {int(m[1])}", int(m[1])
    m = re.fullmatch(r"من\s*(\d+)\s*([أب])?", t)
    if m: return f"من الحديث {m[1]}" + (f" ({m[2]})" if m[2] else ""), None
    return t, None


def parse_series(path, cfg):
    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    body = body_of(soup)
    sid = cfg["id"]
    title = cfg.get("title") or page_title(path)
    series = dict(id=sid, title=title, sec=cfg["sec"], description=cfg["desc"], unit=cfg["unit"], ordered=True)
    for a in body.find_all("a", href=True):                      # SoundCloud mirror of "the rest of the recordings"
        if "soundcloud.com" in a["href"]:
            series["extra"] = {"label": "بقية التسجيلات على ساوند كلاود", "url": fix_url(a["href"])}
    lessons, section, seen = [], "", set()
    for el in body.find_all(True):
        if el.name in ("p", "h1", "h2", "h3", "h4") and cfg["headings"] and is_heading(el):
            section = re.sub(r"\[.*?\]", "", clean(el.get_text(" "))).strip(" :")
        elif el.name == "a" and MEDIA.search(el.get("href", "")):
            src = fix_url(el["href"])
            if src in seen: continue
            seen.add(src)
            ttl, n = parse_title(el.get_text(" "), src)
            if not ttl: continue
            item = dict(id=f"{sid}-{len(lessons) + 1:04d}", title=ttl, series=sid, kind="audio", src=src)
            if n is not None: item["n"] = n
            if section: item["section"] = section
            stamp(item, *date_from_filename(src))
            lessons.append(item)
    # chronological order inside the series (stable: keeps page order where there is no date)
    if sum("date" in l for l in lessons) >= 0.8 * len(lessons):   # undated items follow the nearest dated one before them
        keys, last = [], "0000"
        for l in lessons:
            last = l.get("date", last); keys.append(last)
        lessons = [l for _, _, l in sorted(zip(keys, range(len(lessons)), lessons), key=lambda t: (t[0], t[1]))]
        for i, l in enumerate(lessons, 1): l["id"] = f"{sid}-{i:04d}"
    return series, lessons


# ───────── table pages: lectures / khutab ─────────
def table_rows(body):
    """yield (heading, title_cell_text, [media/pdf links]) for each <tr>; heading = last bold <p> before it"""
    heading = ""
    for el in body.find_all(True):
        if el.name == "p" and is_heading(el) and not el.find_parent("table"):
            heading = clean(el.get_text(" "))
        elif el.name == "tr":
            tds = el.find_all("td")
            links = [(clean(a.get_text(" ")), fix_url(a["href"])) for a in el.find_all("a", href=True) if MEDIA.search(a["href"]) or PDF.search(a["href"])]
            if tds and links:
                yield heading, tds[0], links


def parse_lectures(path, existing_srcs):
    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    out = {"misc": [], "urdu-lectures": []}
    for heading, td, links in table_rows(body_of(soup)):
        title = clean(td.get_text(" "))
        src = links[0][1]
        if not MEDIA.search(src) or src in existing_srcs: continue
        existing_srcs.add(src)
        item = dict(title=title, kind="audio", src=src)
        out["urdu-lectures" if "أردو" in heading or "اردو" in heading else "misc"].append(item)
    return out


def parse_khutab(path):
    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    items = []
    for _, td, links in table_rows(body_of(soup)):
        title, hd = date_from_title(clean(td.get_text(" ")))
        src = links[0][1]
        if not MEDIA.search(src): continue
        item = dict(title=title, kind="audio", src=src)
        stamp(item, hd, "")
        items.append(item)
    return items


def parse_urdu_page(path, urdu_lectures, seen_srcs):
    """Urdu page: its lecture list overlaps the lectures page; it also has a YouTube message + Urdu books."""
    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    books = []
    for a in body_of(soup).find_all("a", href=True):
        href = a["href"]
        yt = re.match(r"https?://youtu\.be/([\w-]{11})", href)
        if yt:
            urdu_lectures.insert(0, dict(title=clean(a.get_text(" ")), kind="video", id=yt.group(1)))
        elif MEDIA.search(href) and fix_url(href) not in seen_srcs:
            li = a.find_parent("li")
            urdu_lectures.append(dict(title=clean(li.get_text(" ")).replace("ڈائون لوڈ", "").strip() if li else "", kind="audio", src=fix_url(href)))
            seen_srcs.add(fix_url(href))
        elif PDF.search(href):
            li = a.find_parent("li")
            title = clean(li.get_text(" ")).replace("ڈائون لوڈ", "").strip() if li else ""
            if title: books.append(dict(title=title, group="كتب بالأردية", lang="ur", files=[{"label": "تحميل PDF", "url": fix_url(href)}]))
    return books


# ───────── books ─────────
def parse_books(path):
    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    books = []
    for group, td, links in table_rows(body_of(soup)):
        first = clean(td.get_text(" "))
        note = ""
        m = re.search(r"\[(ملاحظة[^\]]*)\]", first)
        if m: note, first = m.group(1), clean(first.replace(m.group(0), ""))
        pdfs = [(l, u) for l, u in links if PDF.search(u)]
        if not pdfs: continue
        files = [{"label": (l or "تحميل PDF") if len(pdfs) > 1 else "تحميل PDF", "url": u} for l, u in pdfs]
        bk = dict(title=first, group=group, files=files)
        if note: bk["note"] = note
        if "اردو" in group or "أردو" in group: bk["lang"] = "ur"
        books.append(bk)
    return books


def load_dead():
    if not DEAD.exists(): return set()
    return {ln.split("#")[0].strip() for ln in DEAD.read_text(encoding="utf-8").splitlines() if ln.split("#")[0].strip()}


def drop_dead(lessons, books, dead):
    kept = [l for l in lessons if l.get("src") not in dead]
    nb = []
    for b in books:
        files = [f for f in b["files"] if f["url"] not in dead]
        if files: nb.append({**b, "files": files})
    return kept, nb


def prune(missing_file):
    """Merge HTTP-404 URLs from tools/missing.txt into dead_links.txt, then remove them from library.json."""
    dead = load_dead()
    new = {}
    for ln in Path(missing_file).read_text(encoding="utf-8").splitlines():
        parts = ln.split("\t")
        if len(parts) >= 3 and parts[0].strip() in ("HTTP 404", "HTTP 410"): new[parts[2].strip()] = parts[1].strip()
    lines = [] if not DEAD.exists() else DEAD.read_text(encoding="utf-8").splitlines()
    for url, group in new.items():
        if url not in dead: lines.append(f"{url}  # {group}")
    DEAD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    dead = load_dead()
    lib = json.loads(OUT.read_text(encoding="utf-8"))
    n0, b0 = len(lib["lessons"]), sum(len(b["files"]) for b in lib["books"])
    lib["lessons"], lib["books"] = drop_dead(lib["lessons"], lib["books"], dead)
    left = {l["series"] for l in lib["lessons"]}
    gone = [s["title"] for s in lib["series"] if s["id"] not in left and s["id"] != "misc"]
    lib["series"] = [s for s in lib["series"] if s["id"] in left or s["id"] == "misc"]
    OUT.write_text(json.dumps(lib, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(new)} new dead URLs recorded in {DEAD.name} ({len(dead)} total); removed "
          f"{n0 - len(lib['lessons'])} lessons and {b0 - sum(len(b['files']) for b in lib['books'])} book files from library.json")
    if gone: print("series now empty and removed:", ", ".join(gone))


def main():
    if len(sys.argv) < 2: sys.exit(__doc__)
    if sys.argv[1] == "--prune":
        if len(sys.argv) < 3: sys.exit("usage: python import_wordpress.py --prune tools/missing.txt")
        return prune(sys.argv[2])
    if BeautifulSoup is None: sys.exit("pip install -r requirements.txt   (beautifulsoup4, hijridate)")
    folder = Path(sys.argv[1])
    pages = {page_title(p): p for p in folder.glob("*.html")}
    find = lambda prefix: next((p for t, p in pages.items() if t.startswith(prefix)), None)

    series, lessons = [], []
    for prefix, cfg in SERIES.items():
        p = find(prefix)
        if not p: print("!! missing page:", prefix); continue
        s, ls = parse_series(p, cfg)
        series.append(s); lessons += ls
        print(f"  {len(ls):4}  {s['title']}")

    seen = {l["src"] for l in lessons if "src" in l}
    lec = parse_lectures(find("المحاضرات"), seen)
    if find("اردو"):
        books_ur = parse_urdu_page(find("اردو"), lec["urdu-lectures"], seen)
    else:
        books_ur = []
    # lectures: Arabic ones join the existing "misc" series of the YouTube catalogue; Urdu ones get a series
    for i, l in enumerate(lec["misc"], 1): l.update(id=f"lec-{i:03d}", series="misc")
    for i, l in enumerate(lec["urdu-lectures"], 1):
        l["series"] = "urdu-lectures"
        l["id"] = l["id"] if l["kind"] == "video" else f"urdu-lec-{i:03d}"
    series.append(dict(id="urdu-lectures", title="محاضرات بالأردية", sec="urdu", description="محاضرات وكلمات باللغة الأردية.", unit="المحاضرة"))
    lessons += lec["misc"] + lec["urdu-lectures"]
    print(f"  {len(lec['misc']):4}  lectures (Arabic) -> misc series\n  {len(lec['urdu-lectures']):4}  lectures (Urdu)")

    kh = parse_khutab(find("الخطب"))
    kh.sort(key=lambda l: l.get("date", "0000"), reverse=False)
    for i, l in enumerate(kh, 1): l.update(id=f"khutba-{i:03d}", series="khutab")
    series.append(dict(id="khutab", title="الخطب", sec="khutab", description="خطب الجمعة والمناسبات.", unit="الخطبة"))
    lessons += kh
    print(f"  {len(kh):4}  khutab")

    books = parse_books(find("الكتب"))
    have = {Path(f["url"]).name for b in books for f in b["files"]}
    books += [b for b in books_ur if Path(b["files"][0]["url"]).name not in have]
    for i, b in enumerate(books, 1): b["id"] = f"book-{i:03d}"
    print(f"  {len(books):4}  books")

    dead = load_dead()
    n_before = len(lessons)
    lessons, books = drop_dead(lessons, books, dead)
    if dead: print(f"  skipped {n_before - len(lessons)} lessons with known-dead links (dead_links.txt)")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dict(series=series, lessons=lessons, books=books), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\n{len(lessons)} lessons, {len(series)} series, {len(books)} books -> {OUT.relative_to(OUT.parents[2])}")


if __name__ == "__main__":
    main()
