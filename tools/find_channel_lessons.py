#!/usr/bin/env python3
"""Find the Sheikh's lessons on another YouTube channel (e.g. the Haram's guidance channel @twjehDM). Run on YOUR machine (needs YOUTUBE_API_KEY in .env).

    python tools/find_channel_lessons.py --handle @twjehDM
    python tools/find_channel_lessons.py --handle @twjehDM --no-uploads      # playlists only (cheapest)
    python tools/find_channel_lessons.py --handle @twjehDM --alias "اسم آخر"   # extra names to look for

It reads the channel's playlists and its uploads (titles and descriptions only; nothing is downloaded) and looks for the Sheikh's name (the aliases in
config.json plus common spellings, ignoring diacritics and letter variants). It prints: the channel, every playlist with how many of its videos name the
Sheikh, the matching videos that are in no playlist, and which matches we already have on the site. Writes tools/channel_report.txt and
tools/channel_hits.json (git-ignored). Cost: about 1 API quota unit per 50 videos (a 5,000-video channel is ~100 units of the 10,000 a day).
Nothing is published by this tool: it only reports, so a person can decide what belongs on the site (only the Sheikh's own lessons)."""
import argparse, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import ingest                                  # .env loader, API helper
from build_catalogue import norm               # the same Arabic normalisation the catalogue uses

BASE_NAMES = [r"وصي\s*(ال)?له", r"وصى\s*الله", r"wasi\s*-?\s*ullah", r"wasiullah", r"wasi\s+allah"]


def pages(endpoint, params):
    token = None
    while True:
        data = ingest.api_get(endpoint, {**params, **({"pageToken": token} if token else {})})
        yield from data.get("items", [])
        token = data.get("nextPageToken")
        if not token: return


def playlist_videos(pid):
    """-> [(video_id, title, description, published)] for one playlist (private/deleted entries skipped)."""
    out = []
    for it in pages("playlistItems", {"part": "snippet", "playlistId": pid, "maxResults": 50}):
        sn = it.get("snippet", {})
        vid = sn.get("resourceId", {}).get("videoId")
        if vid and sn.get("title") not in ("Private video", "Deleted video"):
            out.append((vid, sn.get("title", ""), sn.get("description", ""), sn.get("publishedAt", "")))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--handle", default="@twjehDM")
    ap.add_argument("--alias", action="append", default=[])
    ap.add_argument("--no-uploads", action="store_true", help="skip scanning every upload (playlists only)")
    a = ap.parse_args(argv)
    ingest.load_dotenv(ingest.ENV_PATH)
    import os
    if not os.environ.get("YOUTUBE_API_KEY"): sys.exit("YOUTUBE_API_KEY is missing (.env or environment).")
    cfg = ingest.load_config()
    names = re.compile("|".join(BASE_NAMES + [re.escape(norm(x)) for x in cfg.get("speaker_aliases", []) + a.alias]), re.I)
    hit = lambda title, desc: bool(names.search(norm(title + " " + desc)))

    ch = ingest.api_get("channels", {"part": "snippet,contentDetails,statistics", "forHandle": a.handle}).get("items")
    if not ch: sys.exit(f"no channel found for {a.handle}")
    ch = ch[0]; cid = ch["id"]; uploads = ch["contentDetails"]["relatedPlaylists"]["uploads"]
    cat = {l["id"] for l in json.loads((ROOT / "site" / "catalogue.json").read_text(encoding="utf-8"))["lessons"]}
    out = [f"Channel: {ch['snippet']['title']}  ({a.handle}, {cid})", f"Videos on the channel: {ch['statistics'].get('videoCount', '?')}", ""]

    videos = {}                      # id -> record
    plists = list(pages("playlists", {"part": "snippet,contentDetails", "channelId": cid, "maxResults": 50}))
    out.append(f"{len(plists)} playlists\n")
    rows = []
    for p in plists:
        vs = playlist_videos(p["id"])
        hits = [v for v in vs if hit(v[1], v[2])]
        for v in vs:
            r = videos.setdefault(v[0], {"id": v[0], "title": v[1], "published": v[3][:10], "playlists": [], "hit": hit(v[1], v[2])})
            r["playlists"].append(p["snippet"]["title"])
        rows.append((len(hits), p, len(vs), hits))
    for n, p, total, hits in sorted(rows, key=lambda r: -r[0]):
        out.append(f"{p['snippet']['title']}  [{p['id']}]  videos: {total}, naming the Sheikh: {n}")
        for v in hits[:6]: out.append(f"      {v[0]}  {v[1][:90]}")
        if n > 6: out.append(f"      ... and {n - 6} more")
    if not a.no_uploads:
        up = playlist_videos(uploads)
        for v in up:
            r = videos.setdefault(v[0], {"id": v[0], "title": v[1], "published": v[3][:10], "playlists": [], "hit": hit(v[1], v[2])})
        out.append(f"\nScanned {len(up)} uploads.")
    hits = [r for r in videos.values() if r["hit"]]
    loose = [r for r in hits if not r["playlists"]]
    ours = [r for r in hits if r["id"] in cat]
    out += ["", f"== SUMMARY: {len(hits)} videos name the Sheikh ({len(videos)} videos looked at); {len(ours)} are already on our site; {len(hits) - len(ours)} are not.",
            f"   {len(loose)} of the matches are in no playlist" + ("" if not a.no_uploads else " (not known: uploads were not scanned)")]
    for r in sorted(loose, key=lambda r: r["published"], reverse=True)[:25]: out.append(f"      {r['id']}  {r['published']}  {r['title'][:90]}")
    text = "\n".join(out)
    (ROOT / "tools" / "channel_report.txt").write_text(text, encoding="utf-8")
    (ROOT / "tools" / "channel_hits.json").write_text(json.dumps([{**r, "in_catalogue": r["id"] in cat} for r in hits], ensure_ascii=False, indent=1), encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
