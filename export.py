#!/usr/bin/env python3
"""Export curated/published videos.db rows to catalogue.json for the website."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "videos.db"
DEFAULT_OUTPUT = BASE_DIR / "catalogue.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument(
        "--include-unpublished",
        action="store_true",
        help="Export approved videos even when is_published=0.",
    )
    args = parser.parse_args()

    if not DB_PATH.exists():
        raise SystemExit("videos.db not found. Run ingest.py first.")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    where = """
        speaker_status IN ('CONFIRMED', 'MANUAL_APPROVED')
    """
    if not args.include_unpublished:
        where += " AND is_published=1"

    rows = conn.execute(f"""
        SELECT youtube_id, title_original, title_ar, language, subject,
               content_type, series, lesson_number, published_at
        FROM videos
        WHERE {where}
        ORDER BY
            CASE WHEN series='' THEN 1 ELSE 0 END,
            series,
            CASE WHEN lesson_number IS NULL THEN 1 ELSE 0 END,
            lesson_number,
            published_at
    """).fetchall()

    catalogue = []

    for row in rows:
        title = row["title_ar"].strip() or row["title_original"]

        catalogue.append({
            "id": row["youtube_id"],
            "title": title,
            "series": row["series"] or "دروس عامة",
            "topic": row["subject"] or "",
            "lang": row["language"] or "",
            "date": (row["published_at"] or "")[:4],
            "url": f"https://www.youtube.com/watch?v={row['youtube_id']}",
            "lesson_number": row["lesson_number"],
            "content_type": row["content_type"] or "درس",
        })

    output = Path(args.output)
    output.write_text(
        json.dumps(catalogue, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Exported {len(catalogue)} videos to {output}")


if __name__ == "__main__":
    main()
