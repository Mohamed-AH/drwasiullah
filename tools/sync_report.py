#!/usr/bin/env python3
"""Guard + summary for the daily YouTube sync.   python tools/sync_report.py OLD_catalogue.json NEW_catalogue.json [videos.db]

Exits 1 (so the Action commits nothing) when the new catalogue looks broken: invalid, empty, or more than 3 lessons fewer than before.
Prints a Markdown summary of new lessons, and of videos waiting for review (not published because the title does not name the Sheikh)."""
import json, os, sqlite3, sys
from pathlib import Path

def main():
    old = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")) if Path(sys.argv[1]).exists() else {"lessons": []}
    new = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    o = {l["id"]: l for l in old["lessons"]}; n = {l["id"]: l for l in new["lessons"]}
    added, dropped = [n[i] for i in n if i not in o], [o[i] for i in o if i not in n]
    print("## YouTube sync\n")
    print(f"- lessons: {len(o)} -> {len(n)}  (+{len(added)} / -{len(dropped)})")
    for l in added[:50]: print(f"  - NEW `{l['id']}` {l['title']} (series: {l['series']})")
    for l in dropped[:20]: print(f"  - GONE `{l['id']}` {l['title']}")
    if len(dropped) > 3 or len(n) == 0 or len(n) < len(o) - 3:
        print(f"\n**Refusing to publish: {len(dropped)} lessons disappeared.** Check the API response / videos.jsonl."); return 1
    misc = [l for l in added if l["series"] == "misc"]
    if misc: print(f"- {len(misc)} new lesson(s) landed in the general lectures series (no series rule matched): check their titles.")
    db = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("VIDEOS_DB")
    if db and Path(db).exists():
        rows = sqlite3.connect(db).execute("SELECT COUNT(*) FROM videos WHERE speaker_status='REVIEW'").fetchone()[0]
        print(f"- videos with status REVIEW in the database: {rows} (only those naming the Sheikh in the title are published)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
