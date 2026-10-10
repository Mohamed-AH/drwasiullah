-- Anonymous usage counters (phase 3b of docs/admin-portal-spec.md): one row per day, lesson and kind of event; nothing about the visitor is stored.
-- Written by the public Worker (POST /api/event), read by the admin portal's «الإحصاءات». Never exported to git.
CREATE TABLE IF NOT EXISTS stats_daily (
  day       TEXT NOT NULL,                          -- Makkah calendar day, YYYY-MM-DD
  lesson_id TEXT NOT NULL,
  event     TEXT NOT NULL CHECK (event IN ('play','download','watch')),
  n         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, lesson_id, event)
) WITHOUT ROWID;
