#!/usr/bin/env python3
"""Text (JSON Lines) form of the video database, so it can be diffed/merged in git and updated by the daily GitHub Action.

    python tools/videos_text.py dump            # videos.db  -> data/videos.jsonl   (after you curate with manage.py: commit the .jsonl)
    python tools/videos_text.py load            # data/videos.jsonl -> videos.db     (rebuild your local DB after a git pull)
    VIDEOS_DB=/tmp/v.db python tools/videos_text.py load      # work on another database file

One video per line, sorted by YouTube id, without the volatile `updated_at` (otherwise every daily run would rewrite every line).
`data/videos.jsonl` is the source of truth for the Action; `videos.db` is a local working copy. Standard library only.
"""
import json, os, sqlite3, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = Path(os.environ.get("VIDEOS_DB") or ROOT / "videos.db")
TXT = Path(os.environ.get("VIDEOS_TXT") or ROOT / "data" / "videos.jsonl")
SCHEMA = ROOT / "schema.sql"
SKIP = {"id", "updated_at"}   # `id` is a local autoincrement; updated_at is volatile


def dump():
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
    rows = con.execute("SELECT * FROM videos ORDER BY youtube_id").fetchall()
    lines = [json.dumps({k: r[k] for k in r.keys() if k not in SKIP}, ensure_ascii=False, sort_keys=True) for r in rows]
    TXT.parent.mkdir(parents=True, exist_ok=True)
    TXT.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(lines)} videos -> {TXT}")


def load():
    if DB.exists(): DB.unlink()
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA.read_text(encoding="utf-8"))
    cols = [r[1] for r in con.execute("PRAGMA table_info(videos)") if r[1] not in SKIP]
    n = 0
    for ln in TXT.read_text(encoding="utf-8").splitlines():
        if not ln.strip(): continue
        d = json.loads(ln)
        d["updated_at"] = d.get("created_at", "")
        names = [c for c in cols if c in d] + ["updated_at"]
        con.execute(f"INSERT INTO videos ({','.join(names)}) VALUES ({','.join('?' * len(names))})", [d[c] for c in names])
        n += 1
    con.commit(); con.close()
    print(f"{n} videos -> {DB}")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("dump", "load"): sys.exit(__doc__)
    dump() if sys.argv[1] == "dump" else load()
