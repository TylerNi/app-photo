CREATE TABLE IF NOT EXISTS media (
  id            TEXT PRIMARY KEY,
  owner         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('photo','video')),
  source        TEXT NOT NULL CHECK (source IN ('snap','album')),
  original_name TEXT,
  mime          TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  width         INTEGER,
  height        INTEGER,
  duration_ms   INTEGER,
  taken_at      TEXT,
  created_at    TEXT NOT NULL,
  local_day     TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  thumb_path    TEXT,
  teaser_path   TEXT,
  derive_status TEXT NOT NULL DEFAULT 'pending'
                CHECK (derive_status IN ('pending','ready','failed')),
  sha256        TEXT,
  phash         TEXT
);

CREATE INDEX IF NOT EXISTS idx_media_day    ON media (local_day);
CREATE INDEX IF NOT EXISTS idx_media_recent ON media (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_snap   ON media (source, local_day, owner);

CREATE TABLE IF NOT EXISTS streak_reset (
  id  INTEGER PRIMARY KEY CHECK (id = 1),
  day TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile    TEXT NOT NULL,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_ok_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notification_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  recipient  TEXT NOT NULL,
  local_day  TEXT NOT NULL,
  sent_at    TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 1,
  tag        TEXT
);

CREATE INDEX IF NOT EXISTS idx_notif_lookup
  ON notification_log (recipient, kind, local_day, sent_at DESC);
