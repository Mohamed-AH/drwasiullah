#!/usr/bin/env python3
"""Sort the videos of the Sheikh's own Urdu channel (@DrWasiullahAbbas) into series, sections and topics, and write a REVIEW report. Changes nothing on the site.

    python tools/urdu_channel.py --from channel_all.json                 # classify a saved list (from tools/survey_channel.py), write the review files
    python tools/urdu_channel.py --from channel_all.json --out DIR       # where the review files go (default: next to the list)
    python tools/urdu_channel.py --from channel_all.json --show qa-misc  # print the videos of one series/topic

Rules live in data/urdu_channel_rules.json (series names, topic words, surahs, groups). PLAN and decisions: docs/urdu-channel-plan.md.
Writes urdu_review.csv (one row per video: series, section, number, date, title as it would be shown, topic confidence, flags) and urdu_review.txt (counts,
flags, duplicates, overlaps with the Urdu lessons already on the site, a sample of each topic to read).
Nothing is translated or invented: titles are the Sheikh's own words with boilerplate removed; topics are word matches in the title, for navigation only,
and every uncertain one is flagged. Standard library only; the same functions are meant to be used by the daily sync later."""
import argparse, collections, csv, datetime, json, random, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RULES_PATH = ROOT / "data" / "urdu_channel_rules.json"

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
          "january": 1, "february": 2, "march": 3, "april": 4, "june": 6, "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12}
ARABIC = re.compile(r"[؀-ۿ]")
SHEIKH = r"(?:sheikh|shaikh|shaykh|shaik|shykh)\.?"
BOILER = [
    r"\(?\s*wma\s*s?\s*\d+\s*\)?", r"#\w+",
    rf"\b{SHEIKH}\s*(?:dr\.?\s*)?(?:wasiullah|wasi\s*ullah)\s*(?:muhammad\s*)?abb?ass?\b(?:\s*hafizahullah)?", r"\bdr\.?\s*(?:wasiullah|wasi\s*ullah)\s*(?:muhammad\s*)?abb?ass?\b(?:\s*hafizahullah)?",
    r"\bdrwasiullahabbas\b", r"\bwasiullah\s*(?:muhammad\s*)?abb?ass?\b", r"ڈاکٹر\s*وصی\s*اللہ\s*(?:محمد\s*)?عباس", r"\bfahad\s*abrar\s*production\b", r"\bvideo\s*book\b",
    rf"(?<=\|)\s*{SHEIKH}\s*(?=\||$)", rf"^\s*{SHEIKH}\s*(?=\|)",
]


def load_rules(path=RULES_PATH):
    r = json.loads(Path(path).read_text(encoding="utf-8"))
    r["_series"] = {s["id"]: s for s in r["series"]}
    r["_surah_keys"] = {}
    for n, ar, keys in r["surahs"]:
        for k in keys: r["_surah_keys"].setdefault(norm_surah(k), (n, ar))
    return r


# ---------- normalisation ----------
URDU_MAP = str.maketrans({"ی": "ي", "ے": "ي", "ى": "ي", "ک": "ك", "ہ": "ه", "ھ": "ه", "ۃ": "ه", "ة": "ه", "ں": "ن", "ۂ": "ه", "ؤ": "و", "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا"})


def norm(s):
    s = (s or "").lower().replace("’", "'").replace("‘", "'").replace("ʿ", "'")
    s = s.translate(URDU_MAP)
    s = re.sub(r"[ً-ٰٟـ]", "", s)            # harakat, tatweel
    return re.sub(r"\s+", " ", s).strip()


def roman(s):
    """Roman Urdu spelling varies (zakat / zakath / zakaat, sajda / sajdy): lower case, no apostrophes, doubled letters collapsed."""
    s = re.sub(r"[']", "", norm(s))
    return re.sub(r"([a-z])\1+", r"\1", s)


def norm_surah(s):
    s = roman(re.sub(r"[^a-z]", "", (s or "").lower()))
    return re.sub(r"^(?:al|an|ar|as|at|az|ad|adh|ash|ath|aal)(?=[a-z]{4})", "", s)


# ---------- dates ----------
def valid(y, m, d):
    try: return datetime.date(y, m, d)
    except ValueError: return None


def title_date(title):
    """-> (datetime.date | None, matched text) for a Gregorian date written in the title (day first: 04-12-2020, 11-Dec-20, 20 jun 2023, 28 October 2026)."""
    for m in re.finditer(r"(?<!\d)(\d{1,2})\s*[-/. ]\s*(\d{1,2})\s*[-/. ]\s*(\d{4}|\d{2})(?!\d)", title):
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y = y + 2000 if y < 100 else y
        if 2000 <= y <= 2100 and (dt := valid(y, mo, d)): return dt, m.group(0)
    for m in re.finditer(r"(?<!\d)(\d{1,2})\s*[-/. ]\s*([A-Za-z]{3,9})\s*[-/., ]\s*(\d{4}|\d{2})(?!\d)", title):
        mo = MONTHS.get(m.group(2).lower())
        if not mo: continue
        d, y = int(m.group(1)), int(m.group(3)); y = y + 2000 if y < 100 else y
        if 2000 <= y <= 2100 and (dt := valid(y, mo, d)): return dt, m.group(0)
    return None, ""


def lesson_date(title, published):
    """The date the lesson was given: from the title when it is plausible (not after the upload, not more than a year before), else the upload date. -> (iso, source)."""
    up = datetime.date.fromisoformat(published) if published else None
    dt, _ = title_date(title)
    if dt and up and up - datetime.timedelta(days=400) <= dt <= up + datetime.timedelta(days=1): return dt.isoformat(), "title"
    if dt and not up: return dt.isoformat(), "title"
    return (up.isoformat() if up else ""), ("upload (title date implausible)" if dt else "upload")


# ---------- titles ----------
def strip_title(title, drop=()):
    """The title without channel boilerplate, dates and the words in `drop` (regex strings); parts keep their order, joined by ' | '; repeated parts are shown once."""
    _, dtext = title_date(title)
    t = (title.replace(dtext, " ") if dtext else title).replace("\\", "|")        # a backslash separates parts like a bar
    for pat in BOILER: t = re.sub(pat, " ", t, flags=re.I)
    for pat in drop: t = re.sub(pat, " ", t, flags=re.I)
    t = re.sub(r"\b\d{1,2}\s*[-/]\s*(?:dhul\s*\w+|muharram|safar|rabi\w*|jumada\w*|rajab|shaban|ramadan|ramzan|shawwal)\s*[-/]?\s*\d{0,4}\b", " ", t, flags=re.I)
    parts, seen = [], set()
    for p in t.split("|"):
        p = re.sub(r"\s+", " ", p).strip(" -_|:\\/")
        k = norm(p)
        if p and re.search(r"\w", p) and k not in seen: seen.add(k); parts.append(p)
    return " | ".join(parts)


def urdu_or_roman(cleaned):
    """-> (display title, roman title). Clips: the Urdu-script part when the title has one, else the Roman Urdu as written."""
    parts = [p.strip() for p in cleaned.split("|") if p.strip()]
    ar = [p for p in parts if ARABIC.search(p)]
    ro = [p for p in parts if not ARABIC.search(p)]
    if not ar and ARABIC.search(cleaned):                       # script mixed inside one part: take the Arabic-script run
        runs = re.findall(r"[؀-ۿ][؀-ۿ\s؟،ـﷺ….\-0-9]*", cleaned)
        run = max(runs, key=len).strip() if runs else ""
        if len(run.split()) >= 2: return run, re.sub(r"\s+", " ", cleaned.replace(run, " ")).strip(" -|")
    if ar: return " | ".join(ar), " | ".join(ro)
    return cleaned, cleaned


# ---------- surah ----------
def find_surah(rules, text):
    m = re.search(r"\b(?:surah|surat|sura|surh|soorah)\s+(?:al[- ]|an[- ]|ar[- ]|as[- ]|at[- ]|az[- ]|ad[- ]|adh[- ]|ash[- ]|ath[- ])?([a-z']+(?:[- ][a-z']+)?)", text.lower())
    if not m: return None
    w = m.group(1).replace("'", "").replace("-", " ")
    for c in (w, w.split(" ")[0], w.replace(" ", "")):
        k = norm_surah(c)
        if k in rules["_surah_keys"]: return rules["_surah_keys"][k]
    return None


# ---------- topics ----------
def build_topic_matchers(rules):
    """-> [(series id, [(regex, weight)])]. Roman words: spelling-normalised stems (4+ letters may carry up to 2 more letters: sajd -> sajda/sajde/sajdy/sajdo); Urdu words: whole words or longer words beginning with a 4+ letter stem."""
    out = []
    for t in rules["topics"]:
        pats = []
        for words, w in ((t["words"], 2), (t.get("weak", []), 1)):
            for word in words:
                if ARABIC.search(word):
                    k = re.escape(norm(word)); tail = r"[؀-ۿ]{0,3}" if len(norm(word)) >= 4 else ""
                    pats.append((re.compile(rf"(?<![؀-ۿ]){k}{tail}(?![؀-ۿ])"), w))
                else:
                    k = re.escape(roman(word)); tail = r"[a-z]{0,2}" if len(roman(word)) >= 4 and " " not in word else ""
                    pats.append((re.compile(rf"(?<![a-z]){k}{tail}(?![a-z])"), w))
        out.append((t["series"], pats))
    return out


def topic_of(matchers, text):
    """-> (series id, confidence, [(series, score)]). Score = sum of word weights (each word once); the best topic wins; no match -> qa-misc; a tie or a margin of 1 is 'ambiguous'."""
    rt, ut = roman(text), norm(text)
    scores = []
    for sid, pats in matchers:
        hit = 0
        for rx, w in pats:
            if rx.search(ut if rx.pattern.find("\\u0600") >= 0 else rt): hit += w
        scores.append((hit, sid))
    ranked = sorted(scores, key=lambda x: -x[0])
    best, second = ranked[0][0], ranked[1][0]
    if best == 0: return "qa-misc", "none", []
    tops = [sid for s, sid in scores if s == best]
    conf = "high" if best - second >= 2 else "ambiguous"
    return tops[0], conf, [(sid, s) for s, sid in ranked if s][:3]


AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


def hajj_season(date, hd=""):
    """Hijri year of a Hajj class as a section label («حج ١٤٤٤ هـ»). The Hijri date in the title when it has one; otherwise from the Gregorian date, which is only
    unambiguous for classes given between March and July (Shawwal to Dhul Hijjah): Hijri year = round((year - 622) * 1.030684), exact for 2023-2029. Else ''."""
    try:
        y = int(hd.split("-")[0]) if hd else None
        if y is None and date and 3 <= int(date[5:7]) <= 7: y = int((int(date[:4]) - 622) * 1.030684 + 0.5)
    except (ValueError, IndexError):
        y = None
    return f"حج {y} هـ".translate(AR_DIGITS) if y else ""


# ---------- the classifier ----------
def classify(rules, matchers, v):
    """v: {id, title, published, seconds, playlists}. -> dict with series, section, n, date, date_source, title, title_roman, confidence, flags."""
    title, secs, pls = v["title"], v.get("seconds") or 0, " | ".join(v.get("playlists", []))
    low = norm(title + " " + pls)
    G = rules["groups"]
    date, dsrc = lesson_date(title, v.get("published", ""))
    mh = re.search(r"(?<!\d)(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(14\d\d)(?!\d)", title)
    hd = f"{mh.group(3)}-{int(mh.group(2))}-{int(mh.group(1))}" if mh and 1 <= int(mh.group(2)) <= 12 and 1 <= int(mh.group(1)) <= 30 else ""
    out = {"id": v["id"], "series": "", "section": "", "n": "", "date": date, "hd": hd, "date_source": dsrc, "title": "", "title_roman": "", "confidence": "", "flags": [], "seconds": secs, "published": v.get("published", ""), "original": title}
    m_wma = re.search(r"\bwma\s*(s?)\s*(\d+)\b", low)
    classy = re.search(G["quran_class"] + "|" + G["hajj_class"] + "|" + G["qa_marks"] + "|" + G["akhirah_marks"], low)
    year = (date or "0000")[:4]
    if m_wma or (secs and secs <= 300 and not classy and not re.search(G["deoband_book"], low)):
        cleaned = strip_title(title)
        disp, roman_t = urdu_or_roman(cleaned)
        out["title"], out["title_roman"] = disp, roman_t
        out["n"] = int(m_wma.group(2)) if (m_wma and not m_wma.group(1)) else ""
        out["flags"].append("short" if (m_wma and m_wma.group(1)) or secs <= 75 else "clip")
        if not m_wma: out["flags"].append("no_wma_number")
        if not ARABIC.search(cleaned) and re.search(r"\b(the|is|are|of|what|how|ruling|why|does|can|who|when|if)\b", low): out["flags"].append("english_title")
        sid, conf, sc = topic_of(matchers, cleaned + " " + (roman_t or ""))
        out["series"], out["confidence"] = sid, conf
        if conf == "ambiguous": out["flags"].append("topic_ambiguous:" + "/".join(f"{a}={b}" for a, b in sc))
        if secs and secs < 5: out["flags"].append("under_5s")
    elif re.search(G["akhirah_marks"], low):
        out["series"] = "akhirah-urdu"; out["title"] = strip_title(title, [G["quran_class"]]) or "الإيمان باليوم الآخر"
    elif re.search(G["quran_class"], low):
        has_tafsir, has_qa = re.search(G["tafsir_marks"], low), re.search(G["qa_marks"], low)
        if has_tafsir or not has_qa:
            surah = find_surah(rules, title + " " + pls)
            out["series"] = "quran-tafsir-urdu"
            out["title"] = strip_title(title, [G["quran_class"], G["tafsir_marks"]]) or "درس القرآن"
            if surah: out["section"] = f"{surah[0]:03d}|سورة {surah[1]}"
            else: out["section"] = "999|غير محدد"; out["flags"].append("surah_unknown")
        else:
            out["series"] = "quran-qa-urdu"
            rest = strip_title(title, [G["quran_class"], G["qa_marks"]])
            out["title"] = urdu_or_roman(rest)[0] if len(rest.split()) >= 2 else "سؤال وجواب"
            out["section"] = year
    elif re.search(G["hajj_class"], low):
        out["series"] = "hajj-classes-urdu"
        mm = re.search(r"dars[-_ ]*(?:e[-_ ]*)?(?:hajj)?[-_ ]*(\d{1,3})\b", low)
        out["n"] = int(mm.group(1)) if mm else ""
        out["title"] = strip_title(title) or "درس الحج"
        out["section"] = hajj_season(date, hd)
        if not mm: out["flags"].append("no_number")
        if not out["section"]: out["flags"].append("hajj_season_unknown")
    elif re.search(G["deoband_book"], low):
        out["series"] = "deoband-book-urdu"; out["title"] = urdu_or_roman(strip_title(title))[0] or title
    elif re.search(G["qa_marks"], low):
        out["series"] = "quran-qa-urdu"
        rest = strip_title(title, [G["qa_marks"]])
        out["title"] = urdu_or_roman(rest)[0] if len(rest.split()) >= 2 else "سؤال وجواب"
        out["section"] = year
    else:
        out["series"] = "talks-urdu"; out["title"] = urdu_or_roman(strip_title(title))[0] or title
        grp = next((g for g in G["talk_groups"] if re.search(g["pattern"], low)), None)
        out["section"] = f"{G['talk_groups'].index(grp) + 1:02d}|{grp['label']}" if grp else "99|أخرى"
        if secs and secs < 600: out["flags"].append("short_talk")
    if dsrc.startswith("upload (title"): out["flags"].append("date_conflict")
    if not out["title"]: out["title"] = title; out["flags"].append("title_empty_after_cleaning")
    return out


# ---------- report ----------
def existing_urdu_items():
    """Urdu lessons already on the site (haram.json) -> [(date, seconds, title, series)] to spot lessons that exist twice."""
    out = []
    try:
        H = json.loads((ROOT / "site" / "data" / "haram.json").read_text(encoding="utf-8"))
        urdu_series = {s["id"] for s in H["series"] if s.get("sec") == "urdu" or "الأردية" in s.get("title", "")}
        out = [(l.get("date", ""), l.get("duration") or 0, l["title"], l["series"]) for l in H["lessons"] if l["series"] in urdu_series]
    except Exception: pass
    return out


def overlaps(rows):
    """A lesson on the site and a channel video are probably the same recording when the dates are within a day and the lengths within 15% (or 5 minutes)."""
    res = []
    for d, secs, t, s in existing_urdu_items():
        try: dd = datetime.date.fromisoformat(d)
        except Exception: continue
        for r in rows:
            if not r["date"] or r["seconds"] < 1200: continue
            if abs((datetime.date.fromisoformat(r["date"]) - dd).days) <= 1 and (not secs or abs(r["seconds"] - secs) <= max(300, secs * 0.15)): res.append((d, secs, t, s, r))
    return res


def report(rules, rows):
    out = [f"Urdu channel: {len(rows)} videos classified with data/urdu_channel_rules.json", ""]
    by = collections.defaultdict(list)
    for r in rows: by[r["series"]].append(r)
    out.append("== PER SERIES  (videos | hours | with a lesson date in the title | topic confidence: no match / ambiguous)")
    for s in rules["series"]:
        g = by.get(s["id"], [])
        if not g: out.append(f"   {s['id']:20s}      0"); continue
        h = sum(r["seconds"] for r in g) / 3600
        td = sum(1 for r in g if r["date_source"] == "title") * 100 // len(g)
        no = sum(1 for r in g if r["confidence"] == "none"); am = sum(1 for r in g if r["confidence"] == "ambiguous")
        out.append(f"   {s['id']:20s}{len(g):6d} | {h:6.1f} h | {td:3d}% | {no}/{am}   [{s['sec']}] {s['title']}")
    sec = collections.defaultdict(collections.Counter)
    for r in rows:
        if r["section"]: sec[r["series"]][r["section"]] += 1
    out += ["", "== SECTIONS INSIDE SERIES"]
    for sid, c in sec.items(): out.append(f"   {sid}: " + ", ".join(f"{k.split('|')[-1]} ({n})" for k, n in sorted(c.items())))
    flags = collections.Counter(f.split(":")[0] for r in rows for f in r["flags"])
    out += ["", "== FLAGS (what a person should look at)"] + [f"   {n:5d}  {f}" for f, n in flags.most_common()]
    seen = collections.defaultdict(list)
    for r in rows: seen[(r["title"], r["date"])].append(r)
    dups = {k: g for k, g in seen.items() if len(g) > 1 and len(k[0]) > 12}
    out += ["", f"== SAME TITLE AND DATE: {len(dups)} groups (parts of one session, or re-uploads)"]
    for (t, d), g in list(dups.items())[:30]: out.append(f"   {d} {t[:60]}  ids: {', '.join(r['id'] for r in g)}  mins: {', '.join(str(r['seconds'] // 60) for r in g)}")
    ov = overlaps(rows)
    out += ["", f"== PROBABLY THE SAME RECORDING as a lesson already on the site (dates within a day, lengths within 15%): {len(ov)}"]
    for d, secs, t, s, r in ov[:40]: out.append(f"   site {d} [{s}] {t[:45]} ({secs // 60} min)  =  channel {r['date']} [{r['series']}] {r['title'][:35]} ({r['seconds'] // 60} min) {r['id']}")
    out += ["", "== SAMPLE OF EACH TOPIC (12 random clips each: read these to judge the words)"]
    rnd = random.Random(7)
    for s in rules["series"]:
        if s["sec"] != "urdu-qa": continue
        g = by.get(s["id"], [])
        out.append(f"-- {s['id']} ({len(g)}) {s['title']}")
        for r in rnd.sample(g, min(12, len(g))): out.append(f"      [{r['confidence'] or '-':9s}] {r['title'][:62]:62s} | {r['title_roman'][:50]}")
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", required=True, help="channel_all.json from tools/survey_channel.py")
    ap.add_argument("--rules", default=str(RULES_PATH))
    ap.add_argument("--out", help="folder for the review files (default: next to the list)")
    ap.add_argument("--show", help="print the videos of one series id")
    a = ap.parse_args(argv)
    data = json.loads(Path(a.src).read_text(encoding="utf-8")); vids = data["videos"]
    rules = load_rules(a.rules); matchers = build_topic_matchers(rules)
    rows = [classify(rules, matchers, v) for v in vids]
    out = Path(a.out) if a.out else Path(a.src).resolve().parent
    if a.show:
        for r in sorted((r for r in rows if r["series"] == a.show), key=lambda r: r["date"]): print(f"{r['date']} {r['seconds'] // 60:4d} min  [{r['confidence'] or '-':9s}] {r['title'][:80]}  | {r['original'][:60]}")
        return
    cols = ["id", "series", "section", "n", "date", "hd", "date_source", "seconds", "title", "title_roman", "confidence", "flags", "original"]
    with open(out / "urdu_review.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f); w.writerow(cols)
        for r in sorted(rows, key=lambda r: (r["series"], r["section"], r["date"])): w.writerow([r[c] if c != "flags" else "; ".join(r["flags"]) for c in cols])
    text = report(rules, rows)
    (out / "urdu_review.txt").write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
