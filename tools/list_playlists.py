#!/usr/bin/env python3
"""Do the channel's YouTube playlists line up with our series?   python tools/list_playlists.py     (needs YOUTUBE_API_KEY in .env or the environment)

Series are currently guessed from video titles. If the team keeps one playlist per series on YouTube, the playlists are a better source:
the uploader decides membership explicitly, so no title pattern is involved. This script is read-only. For each playlist it prints how many of
its videos we publish, and in which of our series they sit, so you can see whether playlists and series agree before anything depends on it.
Costs a few dozen API quota units. Writes tools/playlists_report.txt (git-ignored)."""
import collections, json, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import ingest   # reuses its .env loader, API helper and channel resolver


def pages(endpoint, params):
    tok = None
    while True:
        data = ingest.api_get(endpoint, {**params, **({"pageToken": tok} if tok else {})})
        yield from data.get("items", [])
        tok = data.get("nextPageToken")
        if not tok: return


def main():
    ingest.load_dotenv(ingest.ENV_PATH)
    if not os.environ.get("YOUTUBE_API_KEY"): sys.exit("YOUTUBE_API_KEY is missing (.env or environment).")
    channel_id, title, _ = ingest.resolve_channel(ingest.load_config())
    cat = json.loads((ROOT / "site" / "catalogue.json").read_text(encoding="utf-8"))
    ours = {l["id"]: l["series"] for l in cat["lessons"]}
    titles = {l["id"]: l["title"] for l in cat["lessons"]}
    mapped = json.loads((ROOT / "config.json").read_text(encoding="utf-8")).get("playlist_series") or {}   # playlist id -> our series id
    names = {s["id"]: s["title"] for s in cat["series"]}
    out = [f"Channel: {title}", f"Published lessons: {len(ours)}", ""]
    covered = set()
    plists = list(pages("playlists", {"part": "snippet,contentDetails", "channelId": channel_id, "maxResults": 50}))
    out.append(f"{len(plists)} playlists\n")
    for p in sorted(plists, key=lambda p: -p["contentDetails"]["itemCount"]):
        ids = [i["contentDetails"]["videoId"] for i in pages("playlistItems", {"part": "contentDetails", "playlistId": p["id"], "maxResults": 50})]
        mine = [i for i in ids if i in ours]; covered.update(mine)
        by = collections.Counter(ours[i] for i in mine)
        out.append(f"{p['snippet']['title']}  [{p['id']}]  videos: {len(ids)}, published by us: {len(mine)}")
        for sid, k in by.most_common(4): out.append(f"      {k:4}  in our series: {names.get(sid, sid)}")
        if len(ids) - len(mine): out.append(f"      {len(ids) - len(mine):4}  not published by us (other speakers, or not matched)")
        sid = mapped.get(p["id"])
        if sid:   # playlist mapped to one of our series in config.json: list the disagreements
            extra = [i for i in mine if ours[i] != sid]
            missing = [i for i, s_ in ours.items() if s_ == sid and i not in ids]
            out.append(f"      mapped to series '{sid}': {len(extra)} of its videos sit in another series on our side, {len(missing)} of our '{sid}' lessons are not in the playlist")
            for i in extra[:40]: out.append(f"         in playlist, ours={ours[i]}: {i}  {titles[i][:80]}")
            for i in missing[:40]: out.append(f"         not in playlist:        {i}  {titles[i][:80]}")
    out.append(f"\nPublished lessons that are in at least one playlist: {len(covered)} of {len(ours)}")
    text = "\n".join(out)
    print(text)
    (ROOT / "tools" / "playlists_report.txt").write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
