-- Asset management tables
-- Run as: sudo -u postgres psql -d script_editor -f db/migrate-assets.sql

CREATE TABLE IF NOT EXISTS asset (
  id                TEXT        PRIMARY KEY,
  production_id     TEXT        NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  uploader_open_id  TEXT        NOT NULL REFERENCES feishu_user(open_id),
  asset_type        TEXT        NOT NULL DEFAULT 'reference',
  file_name         TEXT        NOT NULL,
  mime_type         TEXT,
  is_universal      BOOLEAN     NOT NULL DEFAULT TRUE,
  storage_type      TEXT        NOT NULL DEFAULT 'r2',   -- 'r2' | 'feishu_link'
  feishu_url        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_production_idx ON asset (production_id, created_at DESC);
CREATE INDEX IF NOT EXISTS asset_uploader_idx   ON asset (uploader_open_id);

-- Specific file version of an asset (assetVersionID)
CREATE TABLE IF NOT EXISTS asset_file (
  id                TEXT        PRIMARY KEY,
  asset_id          TEXT        NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  r2_key            TEXT,
  thumbnail_r2_key  TEXT,
  file_size         BIGINT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_file_asset_idx ON asset_file (asset_id);

-- Maps (asset_id, version_id) → asset_file_id for versioned assets
CREATE TABLE IF NOT EXISTS asset_version_rel (
  asset_id      TEXT NOT NULL REFERENCES asset(id)       ON DELETE CASCADE,
  version_id    TEXT NOT NULL REFERENCES version(id)     ON DELETE CASCADE,
  asset_file_id TEXT NOT NULL REFERENCES asset_file(id)  ON DELETE CASCADE,
  PRIMARY KEY (asset_id, version_id)
);
CREATE INDEX IF NOT EXISTS asset_version_rel_version_idx ON asset_version_rel (version_id);
CREATE INDEX IF NOT EXISTS asset_version_rel_file_idx    ON asset_version_rel (asset_file_id);

-- Mount points: one row per (asset, mount target)
CREATE TABLE IF NOT EXISTS asset_mount (
  id               TEXT        PRIMARY KEY,
  asset_id         TEXT        NOT NULL REFERENCES asset(id)       ON DELETE CASCADE,
  production_id    TEXT        NOT NULL REFERENCES production(id)  ON DELETE CASCADE,
  mount_type       TEXT        NOT NULL,
  -- 'production' | 'version' | 'scene' | 'scene_snapshot'
  -- 'block' | 'block_snapshot' | 'cue' | 'cue_revision'
  -- 'comment' | 'event' | 'event_schedule' | 'event_tech_req' | 'event_report'
  mount_id         TEXT        NOT NULL,  -- primary entity ID
  mount_aux_id     TEXT,                  -- secondary ID (e.g. version_id for scene_snapshot)
  folder_path      TEXT,                  -- only for production mount type
  mount_mode       TEXT,                  -- 'inherit' | 'tracking' | 'version_only' | NULL
  version_resolved BOOLEAN,              -- for production mount: true=version-resolved, false=global
  created_by       TEXT        NOT NULL REFERENCES feishu_user(open_id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_mount_asset_idx      ON asset_mount (asset_id);
CREATE INDEX IF NOT EXISTS asset_mount_point_idx      ON asset_mount (mount_type, mount_id);
CREATE INDEX IF NOT EXISTS asset_mount_production_idx ON asset_mount (production_id);
