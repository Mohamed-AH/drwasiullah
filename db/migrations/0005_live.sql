-- Phase 5 of docs/admin-portal-spec.md: the "live layer" - small things that must change within a minute, without a rebuild.
-- Read by the public Worker (GET /api/live, cached 60 s), written by the admin portal. Times are UTC "YYYY-MM-DD HH:MM:SS" (the portal's forms are in Makkah time).
CREATE TABLE IF NOT EXISTS banners (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT NOT NULL,
  link        TEXT,                                  -- https only
  kind        TEXT NOT NULL DEFAULT 'info' CHECK (kind IN ('info','notice','urgent')),
  starts_at   TEXT,                                  -- NULL = from now
  ends_at     TEXT,                                  -- NULL = until switched off
  dismissible INTEGER NOT NULL DEFAULT 1,
  active      INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,                          -- plain text, line breaks kept
  link       TEXT,                                   -- https only
  link_label TEXT,
  pinned     INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  publish_at TEXT,                                   -- NULL = as soon as published
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- "no lesson tonight" and similar: attached to one slot of the weekly schedule (its id in site/data/schedule.json) on one Makkah calendar day
CREATE TABLE IF NOT EXISTS schedule_notices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slot       TEXT NOT NULL,
  day        TEXT NOT NULL,                          -- YYYY-MM-DD, Makkah
  kind       TEXT NOT NULL CHECK (kind IN ('cancelled','changed')),
  note       TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS schedule_notices_day ON schedule_notices (day);
