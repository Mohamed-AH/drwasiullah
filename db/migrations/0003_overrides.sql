-- Phase 4b of docs/admin-portal-spec.md: edits to YouTube lessons and series.
-- The daily YouTube sync keeps producing site/catalogue.json untouched; what an editor changes in the portal is stored here as a small PATCH per item
-- (only the fields that differ from what the sync produced) and applied on top at build time (site/data/overrides.json, written by Publish). So a sync can never undo an
-- edit, and fields nobody touched keep following the sync. Lesson patch fields: title, n, section, series, hd, date (null = remove the field), hidden (true = not shown).
-- Series patch fields: title, description, sec, hidden.
CREATE TABLE IF NOT EXISTS overrides (
  kind       TEXT NOT NULL CHECK (kind IN ('lesson','series')),
  id         TEXT NOT NULL,
  patch      TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, id)
) WITHOUT ROWID;

-- lessons as the site will show them: the stored row with its patch applied (a lesson can be moved to another series, renumbered, hidden...)
DROP VIEW IF EXISTS lessons_eff;
CREATE VIEW lessons_eff AS
SELECT l.id, l.origin, l.pos, l.kind,
  CASE WHEN json_type(o.patch, '$.series')  = 'text' THEN json_extract(o.patch, '$.series') ELSE l.series_id END AS series_id,
  CASE WHEN json_type(o.patch, '$.n')       IS NOT NULL THEN json_extract(o.patch, '$.n')       ELSE l.n       END AS n,
  CASE WHEN json_type(o.patch, '$.section') IS NOT NULL THEN json_extract(o.patch, '$.section') ELSE l.section END AS section,
  CASE WHEN json_type(o.patch, '$.title')   IS NOT NULL THEN json_extract(o.patch, '$.title')   ELSE json_extract(l.data, '$.title') END AS title,
  CASE WHEN json_type(o.patch, '$.hd')      IS NOT NULL THEN json_extract(o.patch, '$.hd')      ELSE json_extract(l.data, '$.hd')    END AS hd,
  CASE WHEN json_type(o.patch, '$.date')    IS NOT NULL THEN json_extract(o.patch, '$.date')    ELSE json_extract(l.data, '$.date')  END AS date,
  CASE WHEN json_extract(o.patch, '$.hidden') = 1 THEN 'hidden' ELSE l.status END AS status,
  o.patch IS NOT NULL AS patched
FROM lessons l LEFT JOIN overrides o ON o.kind = 'lesson' AND o.id = l.id;
