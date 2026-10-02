# Sheikh Wasiullah Abbas — YouTube Ingest

This is the lightweight ingestion step for the Arabic digital library.

## What it does

`ingest.py`:

1. Resolves `@wahatsunnah12` with the YouTube Data API.
2. Gets the channel's uploads playlist.
3. Reads every uploaded video using pagination.
4. Fetches video metadata in batches.
5. Stores everything in `videos.db`.
6. Gives each video a conservative preliminary speaker status.

YouTube's API exposes the channel's uploads playlist through `channels.list` and the videos through `playlistItems.list`; video metadata is then retrieved with `videos.list`.

## Setup

You need a YouTube Data API v3 API key.

1. Copy `.env.example` to `.env`.
2. Replace `YOUR_API_KEY_HERE` with your API key.
3. Run:

```bash
python ingest.py
```

No external Python package is required.

## Output

The script creates:

```text
videos.db
```

The main table is:

```text
videos
```

Important fields:

- `youtube_id`
- `title_original`
- `description_original`
- `published_at`
- `thumbnail_url`
- `duration_iso`
- `speaker_score`
- `speaker_status`
- `language`
- `subject`
- `series`
- `lesson_number`
- `is_published`

## Speaker detection

This is deliberately conservative.

A title containing a configured Sheikh name/alias gets the strongest score. A description or tag match contributes less.

Videos without an obvious name match are NOT automatically rejected. They remain `REVIEW`, because a lecture can belong to the Sheikh without putting his name in the title.

Edit `config.json` to add more verified aliases or explicitly known other-speaker names.

## Important

The first ingest is only collection + preliminary classification.

Do not publish everything automatically.

The intended flow is:

YouTube
  -> ingest.py
  -> videos.db
  -> manual review/curation
  -> catalogue.json
  -> Arabic website

For a catalogue of fewer than 1,500 videos, this SQLite approach is intentionally simple.
# drwasiullah
