#!/usr/bin/env python3
"""Survey EVERY video of a YouTube channel that is the Sheikh's own (e.g. @DrWasiullahAbbas, whose titles do not name him). Run on YOUR machine (needs YOUTUBE_API_KEY in .env).

    python survey_channel.py --handle @DrWasiullahAbbas                # reads the channel through the official API, writes the files below, prints the survey
    python survey_channel.py --from-json channel_all.json              # analyse a saved list again (offline, no API key)

STANDALONE: needs only Python 3.8+ (standard library) and a YouTube Data API v3 key: set YOUTUBE_API_KEY, or put YOUTUBE_API_KEY=... in a file named .env next
to this script or in the current folder, or pass --key. Works from any folder and any PC; the repository is not needed.

It reads the channel's playlists and ALL its uploads (title, date, length, which playlists), nothing is downloaded. Quota: about 1 unit per 50 videos
(a 2,600-video channel is ~110 of the 10,000 units a day). Writes (next to this script, or --out DIR; git-ignored in the repository):
    channel_all.json     every video: id, title, published, seconds, playlists, description (first 300 characters)
    channel_titles.tsv   one line per video (id, date, seconds, playlists, title), to read in a spreadsheet
    channel_survey.txt   the survey: lengths, years, scripts, playlist coverage, and the groups of titles that look like one series
Nothing is published by this tool; it only reports, so a person decides which group becomes which series on the site."""
import argparse, collections, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
API = "https://www.googleapis.com/youtube/v3/"


def load_key(cli_key=None):
    if cli_key: return cli_key
    if os.environ.get("YOUTUBE_API_KEY"): return os.environ["YOUTUBE_API_KEY"]
    for f in (HERE / ".env", Path.cwd() / ".env", HERE.parent / ".env"):
        if f.exists():
            for ln in f.read_text(encoding="utf-8-sig").splitlines():
                if ln.strip().startswith("YOUTUBE_API_KEY") and "=" in ln:
                    return ln.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


class Api:
    def __init__(self, key): self.key = key

    def get(self, endpoint, params, tries=4):
        url = API + endpoint + "?" + urllib.parse.urlencode({**params, "key": self.key})
        for i in range(tries):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "survey-channel/1.0"}), timeout=40) as r:
                    return json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", "replace")[:300]
                if e.code in (500, 502, 503, 504) and i < tries - 1: time.sleep(2 ** i); continue
                sys.exit(f"YouTube API error {e.code} for {endpoint}: {body}")
            except (urllib.error.URLError, TimeoutError) as e:
                if i < tries - 1: time.sleep(2 ** i); continue
                sys.exit(f"cannot reach YouTube ({e}). Check the internet connection.")


def chunks(items, size):
    for i in range(0, len(items), size): yield items[i:i + size]


def duration(iso):
    """ISO 8601 (PT1H2M3S) -> seconds."""
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m: return None
    d, h, mi, sec = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + sec

LENGTH_BUCKETS = [(60, "up to 1 min (shorts / clips)"), (300, "1-5 min"), (900, "5-15 min"), (1800, "15-30 min"), (3600, "30-60 min"), (7200, "1-2 h"), (10 ** 9, "over 2 h")]


def pages(api, endpoint, params):
    token = None
    while True:
        data = api.get(endpoint, {**params, **({"pageToken": token} if token else {})})
        yield from data.get("items", [])
        token = data.get("nextPageToken")
        if not token: return


def listing(api, handle):
    """-> (channel info dict, [video dicts]) through the official API."""
    ch = api.get("channels", {"part": "snippet,contentDetails,statistics", "forHandle": handle}).get("items")
    if not ch: sys.exit(f"no channel found for {handle}")
    ch = ch[0]; cid = ch["id"]; uploads = ch["contentDetails"]["relatedPlaylists"]["uploads"]
    videos = {}
    for it in pages(api, "playlistItems", {"part": "snippet", "playlistId": uploads, "maxResults": 50}):
        sn = it.get("snippet", {}); vid = sn.get("resourceId", {}).get("videoId")
        if vid and sn.get("title") not in ("Private video", "Deleted video"):
            videos[vid] = {"id": vid, "title": sn.get("title", ""), "published": sn.get("publishedAt", "")[:10], "seconds": None, "playlists": [], "description": (sn.get("description") or "")[:300]}
    plists = list(pages(api, "playlists", {"part": "snippet,contentDetails", "channelId": cid, "maxResults": 50}))
    for p in plists:
        for it in pages(api, "playlistItems", {"part": "snippet", "playlistId": p["id"], "maxResults": 50}):
            sn = it.get("snippet", {}); vid = sn.get("resourceId", {}).get("videoId")
            if not vid or sn.get("title") in ("Private video", "Deleted video"): continue
            v = videos.setdefault(vid, {"id": vid, "title": sn.get("title", ""), "published": sn.get("publishedAt", "")[:10], "seconds": None, "playlists": [], "description": (sn.get("description") or "")[:300]})
            v["playlists"].append(p["snippet"]["title"])
    ids = list(videos)
    for batch in chunks(ids, 50):
        for v in api.get("videos", {"part": "contentDetails", "id": ",".join(batch), "maxResults": 50}).get("items", []):
            videos[v["id"]]["seconds"] = duration(v.get("contentDetails", {}).get("duration", ""))
    info = {"title": ch["snippet"]["title"], "handle": handle, "id": cid, "reported_videos": ch["statistics"].get("videoCount", "?"), "playlists": len(plists)}
    return info, list(videos.values())


def script_of(title):
    """'arabic' (Arabic or Urdu script), 'latin' (Roman Urdu / English) or 'mixed'."""
    ar = len(re.findall(r"[؀-ۿ]", title)); la = len(re.findall(r"[A-Za-z]", title))
    return "mixed" if ar and la else "arabic" if ar else "latin" if la else "other"


def norm_key(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9؀-ۿ ]", " ", s.lower())).strip()


def group_key(seg):
    """The start of a title without numbers and 'part / episode' words, so 'Sawal o Jawab 12' and 'Sawal o Jawab 13' fall in one group."""
    k = norm_key(seg)
    k = re.sub(r"\b(part|parts|episode|ep|no|number|session|lecture|lesson|qist|qisat|\d+)\b", " ", k)
    return re.sub(r"\s+", " ", k).strip() or norm_key(seg)


def prefix_groups(vids):
    """Titles often look like 'Series | Topic | Part' or 'Series - Topic'. Group by the first segment (before | : - –), numbers removed."""
    by = collections.defaultdict(list)
    for v in vids:
        seg = re.split(r"\s*[|:–—]\s*|\s+-\s+", v["title"], maxsplit=1)[0]
        by[group_key(seg)].append(v)
    return by


def survey(info, vids):
    out = [f"Channel: {info.get('title')}  ({info.get('handle')}, {info.get('id')})", f"Videos on the channel (YouTube's count): {info.get('reported_videos')}   read: {len(vids)}   playlists: {info.get('playlists')}", ""]
    out.append("== LENGTH")
    cnt = collections.Counter()
    for v in vids:
        s = v.get("seconds")
        cnt["unknown"] += 0 if s is not None else 1
        if s is not None:
            for lim, name in LENGTH_BUCKETS:
                if s <= lim: cnt[name] += 1; break
    for _, name in LENGTH_BUCKETS: out.append(f"   {cnt[name]:5d}  {name}")
    if cnt["unknown"]: out.append(f"   {cnt['unknown']:5d}  no length (live / premiere / unavailable)")
    hours = sum(v.get("seconds") or 0 for v in vids) / 3600
    out.append(f"   total about {hours:,.0f} hours")
    out += ["", "== YEARS (upload year)"]
    yc = collections.Counter((v.get("published") or "????")[:4] for v in vids)
    out += [f"   {y}: {n}" for y, n in sorted(yc.items())]
    out += ["", "== SCRIPT OF THE TITLE"]
    sc = collections.Counter(script_of(v["title"]) for v in vids)
    out += [f"   {k}: {n}" for k, n in sc.most_common()]
    inpl = [v for v in vids if v.get("playlists")]
    out += ["", "== PLAYLIST COVERAGE", f"   in at least one playlist: {len(inpl)}", f"   in NO playlist (loose uploads): {len(vids) - len(inpl)}"]
    pc = collections.Counter(p for v in vids for p in v.get("playlists", []))
    out += [f"   {n:4d}  {p}" for p, n in pc.most_common()]
    titles = collections.Counter(norm_key(v["title"]) for v in vids)
    dup = {k: n for k, n in titles.items() if n > 1}
    out += ["", f"== EXACT DUPLICATE TITLES: {len(dup)} titles used more than once ({sum(dup.values())} videos)"]
    for k, n in sorted(dup.items(), key=lambda x: -x[1])[:15]: out.append(f"   {n}x  {k[:90]}")
    loose = [v for v in vids if not v.get("playlists")]
    out += ["", "== TITLE GROUPS (first part of the title), ALL videos: the groups that probably become series. count | in no playlist | example titles"]
    groups = prefix_groups(vids)
    for k, g in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:70]:
        if len(g) < 3: continue
        lo = sum(1 for v in g if not v.get("playlists"))
        ex = sorted(g, key=lambda v: v.get("published") or "")
        out.append(f"   {len(g):4d} | {lo:4d} | {k[:50]}")
        out.append(f"             e.g. {ex[0]['title'][:80]}   /   {ex[-1]['title'][:80]}")
    small = sum(1 for g in groups.values() if len(g) < 3)
    out.append(f"   ... and {small} title starts used by only 1-2 videos")
    out += ["", "== LOOSE UPLOADS (in no playlist), 40 newest and 40 oldest titles"]
    ls = sorted(loose, key=lambda v: v.get("published") or "", reverse=True)
    for v in ls[:40]: out.append(f"   {v['published']}  {(v['seconds'] or 0) // 60:4d} min  {v['title'][:90]}")
    out.append("   ...")
    for v in ls[-40:]: out.append(f"   {v['published']}  {(v['seconds'] or 0) // 60:4d} min  {v['title'][:90]}")
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--handle", default="@DrWasiullahAbbas")
    ap.add_argument("--from-json", help="analyse a saved tools/channel_all.json instead of calling the API")
    ap.add_argument("--out", default=str(HERE), help="folder for the result files (default: next to this script)")
    ap.add_argument("--key", help="YouTube API key (otherwise YOUTUBE_API_KEY / .env)")
    a = ap.parse_args(argv)
    out = Path(a.out)
    if a.from_json:
        data = json.loads(Path(a.from_json).read_text(encoding="utf-8")); info, vids = data["channel"], data["videos"]
    else:
        key = load_key(a.key)
        if not key: sys.exit("YOUTUBE_API_KEY is missing: set the variable, put it in a .env file next to this script, or pass --key.")
        print("reading the channel (about 1-2 minutes)...", file=sys.stderr)
        info, vids = listing(Api(key), a.handle)
        (out / "channel_all.json").write_text(json.dumps({"channel": info, "videos": vids}, ensure_ascii=False, indent=1), encoding="utf-8")
        (out / "channel_titles.tsv").write_text("\n".join("\t".join([v["id"], v.get("published", ""), str(v.get("seconds") or ""), " ; ".join(v.get("playlists", [])), v["title"].replace("\t", " ")]) for v in sorted(vids, key=lambda v: v.get("published") or "")), encoding="utf-8")
    text = survey(info, vids)
    (out / "channel_survey.txt").write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
