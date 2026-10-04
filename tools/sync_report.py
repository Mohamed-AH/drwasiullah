#!/usr/bin/env python3
"""Guard + summary for the daily YouTube sync.   python tools/sync_report.py OLD_catalogue.json NEW_catalogue.json [videos.db]

Exits 1 (so the Action commits nothing) when the new catalogue looks broken: invalid, empty, or more than 3 lessons fewer than before.
Prints a Markdown summary: new lessons, lessons that moved to another series or changed number (a series rule changed or a title was edited),
new lessons that matched no series rule, and lesson numbers that became duplicated. Only changes are reported, not the long-standing ones."""
import collections, json, os, sqlite3, sys
from pathlib import Path


def dupes(lessons):
    c = collections.Counter((l["series"], l["n"]) for l in lessons if l.get("n") is not None and l["series"] != "misc")
    return {k for k, v in c.items() if v > 1}


def main():
    old = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")) if Path(sys.argv[1]).exists() else {"lessons": []}
    new = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    o = {l["id"]: l for l in old["lessons"]}; n = {l["id"]: l for l in new["lessons"]}
    added, dropped = [n[i] for i in n if i not in o], [o[i] for i in o if i not in n]
    moved = [(o[i], n[i]) for i in n if i in o and (o[i]["series"], o[i].get("n")) != (n[i]["series"], n[i].get("n"))]
    print("## YouTube sync\n")
    print(f"- lessons: {len(o)} -> {len(n)}  (+{len(added)} / -{len(dropped)})")
    for l in added[:50]: print(f"  - NEW `{l['id']}` {l['title']} (series: {l['series']}, number: {l.get('n', '-')})")
    for l in dropped[:20]: print(f"  - GONE `{l['id']}` {l['title']}")
    if len(dropped) > 3 or len(n) == 0 or len(n) < len(o) - 3:
        print(f"\n**Refusing to publish: {len(dropped)} lessons disappeared.** Check the API response / videos.jsonl."); return 1

    attention = []
    for a, b in moved[:30]:
        attention.append(f"MOVED `{b['id']}` {b['title'][:70]}: {a['series']} #{a.get('n', '-')} -> {b['series']} #{b.get('n', '-')}")
    attention += [f"UNMATCHED `{l['id']}` {l['title'][:80]} (no series rule matched; it is listed under general lectures)" for l in added if l["series"] == "misc"][:30]
    attention += [f"NO NUMBER `{l['id']}` {l['title'][:80]} (series {l['series']})" for l in added if l["series"] != "misc" and l.get("n") is None][:30]
    attention += [f"DUPLICATE NUMBER {s} #{k} is now used by more than one lesson" for s, k in sorted(dupes(new["lessons"]) - dupes(old["lessons"]))]
    rep = os.environ.get("CATALOGUE_REPORT")
    if rep and Path(rep).exists():
        for c in json.loads(Path(rep).read_text(encoding="utf-8"))[:30]:
            attention.append(f"PLAYLIST CONFLICT `{c['id']}` {c['title'][:70]}: the title says {c['title_series']}, its playlist says {c['playlist_series']} (kept the title; override with manage.py if the playlist is right)")
    if attention:
        print("\n### Needs a look (series rules are title patterns; fix with `manage.py edit <id> --series ... --lesson-number ...`, see docs/data-formats.md)\n")
        for a in attention: print(f"- {a}")
    else:
        print("- classification: nothing needs attention")
    db = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("VIDEOS_DB")
    if db and Path(db).exists():
        rows = sqlite3.connect(db).execute("SELECT COUNT(*) FROM videos WHERE speaker_status='REVIEW'").fetchone()[0]
        print(f"- videos with status REVIEW in the database: {rows} (only those naming the Sheikh in the title are published)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
