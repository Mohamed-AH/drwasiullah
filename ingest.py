#!/usr/bin/env python3
"""
Ingest videos from a public YouTube channel into SQLite.

Target channel:
    @wahatsunnah12

Usage:
    1. Copy .env.example to .env
    2. Put your YouTube Data API v3 key in YOUTUBE_API_KEY
    3. Run:
           python ingest.py

The script:
    - resolves the channel handle
    - finds the channel's uploads playlist
    - downloads every uploaded video using pagination
    - fetches full video metadata in batches of 50
    - stores/upserts the results in videos.db

It does NOT decide that every channel video belongs to Sheikh Wasiullah Abbas.
Those videos are intentionally left with speaker_status=REVIEW unless
the configurable speaker rules produce a strong match.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "videos.db"
ENV_PATH = BASE_DIR / ".env"
CONFIG_PATH = BASE_DIR / "config.json"

API_BASE = "https://www.googleapis.com/youtube/v3"
DEFAULT_HANDLE = "@wahatsunnah12"


def load_dotenv(path: Path) -> None:
    """Tiny .env loader; avoids requiring python-dotenv."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {
            "channel_handle": DEFAULT_HANDLE,
            "speaker_aliases": [
                "Wasiullah Abbas",
                "Wasiullah",
                "وصي الله عباس",
                "وصی اللہ عباس",
                "وصی اللہ",
                "Wasiullah Abbass",
            ],
            "excluded_speakers": [],
        }
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def api_get(endpoint: str, params: dict) -> dict:
    params = dict(params)
    params["key"] = os.environ["YOUTUBE_API_KEY"]
    url = f"{API_BASE}/{endpoint}?{urlencode(params)}"

    req = Request(
        url,
        headers={
            "User-Agent": "SheikhWasiullahLibrary/1.0",
            "Accept": "application/json",
        },
    )

    try:
        with urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(body)
            message = detail.get("error", {}).get("message", body)
        except json.JSONDecodeError:
            message = body
        raise RuntimeError(f"YouTube API error {exc.code}: {message}") from exc
    except URLError as exc:
        raise RuntimeError(f"Network error: {exc.reason}") from exc


def chunks(items: list[str], size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        youtube_id TEXT NOT NULL UNIQUE,
        title_original TEXT NOT NULL,
        description_original TEXT DEFAULT '',
        published_at TEXT,
        channel_id TEXT,
        channel_title TEXT,
        playlist_id TEXT,
        thumbnail_url TEXT,
        tags_json TEXT DEFAULT '[]',
        duration_iso TEXT,
        speaker_score INTEGER DEFAULT 0,
        speaker_status TEXT NOT NULL DEFAULT 'REVIEW',
        language TEXT DEFAULT '',
        subject TEXT DEFAULT '',
        content_type TEXT DEFAULT '',
        series TEXT DEFAULT '',
        lesson_number INTEGER,
        title_ar TEXT DEFAULT '',
        is_published INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_videos_status
        ON videos(speaker_status);

    CREATE INDEX IF NOT EXISTS idx_videos_published
        ON videos(is_published);
    """)
    conn.commit()


def resolve_channel(config: dict) -> tuple[str, str, str]:
    handle = os.environ.get("YOUTUBE_CHANNEL_HANDLE", config.get("channel_handle", DEFAULT_HANDLE))
    handle = handle.strip()

    data = api_get("channels", {
        "part": "id,snippet,contentDetails",
        "forHandle": handle,
    })

    items = data.get("items", [])
    if not items:
        raise RuntimeError(
            f"Could not find a YouTube channel for handle {handle!r}."
        )

    channel = items[0]
    channel_id = channel["id"]
    channel_title = channel.get("snippet", {}).get("title", "")
    uploads_playlist = (
        channel.get("contentDetails", {})
        .get("relatedPlaylists", {})
        .get("uploads")
    )

    if not uploads_playlist:
        raise RuntimeError("The channel response did not contain an uploads playlist.")

    return channel_id, channel_title, uploads_playlist


def get_upload_video_ids(uploads_playlist: str) -> list[str]:
    video_ids: list[str] = []
    page_token = None

    while True:
        params = {
            "part": "contentDetails,snippet,status",
            "playlistId": uploads_playlist,
            "maxResults": 50,
        }
        if page_token:
            params["pageToken"] = page_token

        data = api_get("playlistItems", params)

        for item in data.get("items", []):
            # contentDetails.videoId is the cleanest source for the actual video ID.
            video_id = (
                item.get("contentDetails", {}).get("videoId")
                or item.get("snippet", {}).get("resourceId", {}).get("videoId")
            )
            if video_id:
                video_ids.append(video_id)

        page_token = data.get("nextPageToken")
        if not page_token:
            break

    # Preserve order while removing duplicates.
    return list(dict.fromkeys(video_ids))


def speaker_score(title: str, description: str, tags: list[str], config: dict) -> int:
    """
    Conservative rule-based score.

    Positive matches:
      title       +60
      description +30
      tags        +20

    Explicit excluded-speaker matches force a zero score.
    Names/aliases are configurable in config.json.
    """
    title_l = title.casefold()
    description_l = description.casefold()
    tags_l = " ".join(tags).casefold()

    excluded = config.get("excluded_speakers", [])
    for alias in excluded:
        a = str(alias).casefold().strip()
        if a and (a in title_l or a in description_l or a in tags_l):
            return 0

    aliases = [
        str(x).casefold().strip()
        for x in config.get("speaker_aliases", [])
        if str(x).strip()
    ]

    score = 0
    if any(a in title_l for a in aliases):
        score += 60
    if any(a in description_l for a in aliases):
        score += 30
    if any(a in tags_l for a in aliases):
        score += 20

    return min(score, 100)


def status_from_score(score: int) -> str:
    if score >= 60:
        return "CONFIRMED"
    # Do not automatically reject videos just because the title has no name.
    return "REVIEW"


def choose_thumbnail(snippet: dict) -> str:
    thumbs = snippet.get("thumbnails", {})
    for key in ("maxres", "standard", "high", "medium", "default"):
        if key in thumbs and thumbs[key].get("url"):
            return thumbs[key]["url"]
    return ""


def ingest_videos(
    conn: sqlite3.Connection,
    video_ids: list[str],
    channel_id: str,
    channel_title: str,
    uploads_playlist: str,
    config: dict,
) -> int:
    now = datetime.now(timezone.utc).isoformat()
    count = 0

    for batch in chunks(video_ids, 50):
        data = api_get("videos", {
            "part": "snippet,contentDetails,status",
            "id": ",".join(batch),
            "maxResults": 50,
        })

        for video in data.get("items", []):
            vid = video["id"]
            snippet = video.get("snippet", {})
            details = video.get("contentDetails", {})

            title = snippet.get("title", "")
            description = snippet.get("description", "")
            tags = snippet.get("tags", [])
            score = speaker_score(title, description, tags, config)
            status = status_from_score(score)

            # Preserve manual curation fields if this video already exists.
            existing = conn.execute(
                "SELECT speaker_status, language, subject, content_type, series, "
                "lesson_number, title_ar, is_published FROM videos WHERE youtube_id=?",
                (vid,),
            ).fetchone()

            if existing:
                old_status, language, subject, content_type, series, lesson_number, title_ar, is_published = existing
            else:
                language = subject = content_type = series = title_ar = ""
                lesson_number = None
                is_published = 0

            # Never overwrite a manual rejection/approval during a routine ingest.
            if existing and old_status in ("MANUAL_APPROVED", "MANUAL_REJECTED"):
                status = old_status
            elif existing and old_status in ("CONFIRMED", "REJECTED"):
                # Preserve an existing curation decision.
                status = old_status

            conn.execute("""
                INSERT INTO videos (
                    youtube_id, title_original, description_original,
                    published_at, channel_id, channel_title, playlist_id,
                    thumbnail_url, tags_json, duration_iso,
                    speaker_score, speaker_status,
                    language, subject, content_type, series,
                    lesson_number, title_ar, is_published,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(youtube_id) DO UPDATE SET
                    title_original=excluded.title_original,
                    description_original=excluded.description_original,
                    published_at=excluded.published_at,
                    channel_id=excluded.channel_id,
                    channel_title=excluded.channel_title,
                    playlist_id=excluded.playlist_id,
                    thumbnail_url=excluded.thumbnail_url,
                    tags_json=excluded.tags_json,
                    duration_iso=excluded.duration_iso,
                    speaker_score=excluded.speaker_score,
                    speaker_status=excluded.speaker_status,
                    updated_at=excluded.updated_at
            """, (
                vid,
                title,
                description,
                snippet.get("publishedAt"),
                channel_id,
                channel_title,
                uploads_playlist,
                choose_thumbnail(snippet),
                json.dumps(tags, ensure_ascii=False),
                details.get("duration", ""),
                score,
                status,
                language,
                subject,
                content_type,
                series,
                lesson_number,
                title_ar,
                is_published,
                now,
                now,
            ))
            count += 1

        conn.commit()
        print(f"Processed {count}/{len(video_ids)} videos...", flush=True)

    return count


def main() -> int:
    load_dotenv(ENV_PATH)

    api_key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not api_key:
        print("ERROR: YOUTUBE_API_KEY is missing.")
        print("Copy .env.example to .env and add your YouTube Data API v3 key.")
        return 1

    config = load_config()

    print("Resolving YouTube channel...")
    channel_id, channel_title, uploads_playlist = resolve_channel(config)
    print(f"Channel: {channel_title}")
    print(f"Channel ID: {channel_id}")
    print(f"Uploads playlist: {uploads_playlist}")

    print("Reading uploaded video IDs...")
    video_ids = get_upload_video_ids(uploads_playlist)
    print(f"Found {len(video_ids)} uploaded videos.")

    conn = sqlite3.connect(DB_PATH)
    try:
        init_db(conn)
        ingest_videos(
            conn,
            video_ids,
            channel_id,
            channel_title,
            uploads_playlist,
            config,
        )
    finally:
        conn.close()

    print()
    print(f"Done. Database: {DB_PATH}")
    print("Next step: run manage.py to review/curate the videos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
