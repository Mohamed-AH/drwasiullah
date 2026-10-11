-- Phase 4c: the editors' saved display order of a series (docs/admin-portal-spec.md). One row per series that has been arranged by hand:
-- `ids` is a JSON array of lesson ids, first lesson first. Publish exports them to site/data/order.json; the build gives those lessons an `ord` (applyOrder in core.js).
-- Lessons that are not in the list (new uploads, new videos) follow the listed ones; ids that are no longer in the series are ignored. Deleting the row = automatic order again.
CREATE TABLE IF NOT EXISTS series_order (
  series_id  TEXT PRIMARY KEY,
  ids        TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) WITHOUT ROWID;
