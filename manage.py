#!/usr/bin/env python3
"""Small CLI for reviewing and curating videos.db."""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "videos.db"


def connect():
    if not DB_PATH.exists():
        raise SystemExit("videos.db not found. Run ingest.py first.")
    return sqlite3.connect(DB_PATH)


def cmd_stats(conn):
    rows = conn.execute("""
        SELECT speaker_status, COUNT(*)
        FROM videos
        GROUP BY speaker_status
        ORDER BY speaker_status
    """).fetchall()

    print("Video status:")
    for status, count in rows:
        print(f"  {status:16} {count}")

    total = conn.execute("SELECT COUNT(*) FROM videos").fetchone()[0]
    published = conn.execute(
        "SELECT COUNT(*) FROM videos WHERE is_published=1"
    ).fetchone()[0]
    print(f"  {'TOTAL':16} {total}")
    print(f"  {'PUBLISHED':16} {published}")


def cmd_review(conn, limit):
    rows = conn.execute("""
        SELECT youtube_id, speaker_score, title_original, published_at
        FROM videos
        WHERE speaker_status='REVIEW'
        ORDER BY published_at DESC
        LIMIT ?
    """, (limit,)).fetchall()

    if not rows:
        print("No REVIEW videos.")
        return

    for i, (vid, score, title, published) in enumerate(rows, 1):
        print(f"\n[{i}] {vid}  score={score}")
        print(f"    {published or '-'}")
        print(f"    {title}")
        print(f"    https://www.youtube.com/watch?v={vid}")


def cmd_set_status(conn, youtube_id, status):
    conn.execute(
        "UPDATE videos SET speaker_status=?, updated_at=datetime('now') WHERE youtube_id=?",
        (status, youtube_id),
    )
    conn.commit()
    print(f"{youtube_id}: {status}")


def cmd_publish(conn, youtube_id, value):
    conn.execute(
        "UPDATE videos SET is_published=?, updated_at=datetime('now') WHERE youtube_id=?",
        (1 if value else 0, youtube_id),
    )
    conn.commit()
    print(f"{youtube_id}: is_published={1 if value else 0}")


def cmd_edit(conn, args):
    fields = []
    values = []

    for column, value in [
        ("title_ar", args.title_ar),
        ("language", args.language),
        ("subject", args.subject),
        ("content_type", args.content_type),
        ("series", args.series),
        ("lesson_number", args.lesson_number),
    ]:
        if value is not None:
            fields.append(f"{column}=?")
            values.append(value)

    if not fields:
        print("Nothing to change.")
        return

    values.append(args.youtube_id)
    conn.execute(
        f"UPDATE videos SET {', '.join(fields)}, updated_at=datetime('now') "
        "WHERE youtube_id=?",
        values,
    )
    conn.commit()
    print(f"Updated {args.youtube_id}")


def main():
    parser = argparse.ArgumentParser(description="Curate the Sheikh Wasiullah video catalogue.")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("stats")

    p = sub.add_parser("review")
    p.add_argument("--limit", type=int, default=50)

    p = sub.add_parser("approve")
    p.add_argument("youtube_id")

    p = sub.add_parser("reject")
    p.add_argument("youtube_id")

    p = sub.add_parser("publish")
    p.add_argument("youtube_id")

    p = sub.add_parser("unpublish")
    p.add_argument("youtube_id")

    p = sub.add_parser("edit")
    p.add_argument("youtube_id")
    p.add_argument("--title-ar")
    p.add_argument("--language")
    p.add_argument("--subject")
    p.add_argument("--content-type")
    p.add_argument("--series")
    p.add_argument("--lesson-number", type=int)

    args = parser.parse_args()

    with connect() as conn:
        if args.command == "stats":
            cmd_stats(conn)
        elif args.command == "review":
            cmd_review(conn, args.limit)
        elif args.command == "approve":
            cmd_set_status(conn, args.youtube_id, "MANUAL_APPROVED")
        elif args.command == "reject":
            cmd_set_status(conn, args.youtube_id, "MANUAL_REJECTED")
        elif args.command == "publish":
            cmd_publish(conn, args.youtube_id, True)
        elif args.command == "unpublish":
            cmd_publish(conn, args.youtube_id, False)
        elif args.command == "edit":
            cmd_edit(conn, args)


if __name__ == "__main__":
    main()
