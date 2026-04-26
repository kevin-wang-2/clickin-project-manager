-- Script Editor — full schema
-- Idempotent: safe to run on an existing database.
-- Run as: psql -d script_editor -f schema.sql

-- ── Enum ──────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE block_type AS ENUM ('dialogue', 'stage', 'lyric');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Core tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scene (
  id            TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  num           TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  parent_id        TEXT REFERENCES scene(id) ON DELETE SET NULL,
  synopsis         TEXT,
  action_line      TEXT,
  music            TEXT,
  stage_notes      TEXT,
  expected_duration TEXT
);

CREATE INDEX IF NOT EXISTS scene_production_idx ON scene(production_id, sort_order);

CREATE TABLE IF NOT EXISTS character (
  id            TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_aggregate  BOOLEAN NOT NULL DEFAULT false,
  gender        TEXT,
  biography     TEXT,
  role_type     TEXT
);

CREATE INDEX IF NOT EXISTS character_production_idx ON character(production_id, sort_order);

CREATE TABLE IF NOT EXISTS character_aggregate (
  aggregate_id TEXT NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  member_id    TEXT NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  PRIMARY KEY (aggregate_id, member_id)
);

CREATE TABLE IF NOT EXISTS script (
  id              TEXT PRIMARY KEY,
  production_id   TEXT NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  sort_key        TEXT NOT NULL,
  scene_id        TEXT REFERENCES scene(id) ON DELETE SET NULL,
  rehearsal_mark  TEXT,
  type            block_type NOT NULL DEFAULT 'dialogue',
  content         TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS script_production_sort_idx ON script(production_id, sort_key);

CREATE TABLE IF NOT EXISTS script_character (
  script_id    TEXT NOT NULL REFERENCES script(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  annotation   TEXT,
  PRIMARY KEY (script_id, character_id)
);

-- ── Auth ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feishu_user (
  open_id        TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  avatar_url     TEXT,
  email          TEXT,
  phone          TEXT,
  is_super_admin BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production_member (
  production_id TEXT NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  open_id       TEXT NOT NULL REFERENCES feishu_user(open_id) ON DELETE CASCADE,
  roles         TEXT[] NOT NULL DEFAULT '{}',
  photo_url     TEXT,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (production_id, open_id)
);

-- ── Comments ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS block_comment (
  id            TEXT        PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  production_id TEXT        NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  block_id      TEXT        NOT NULL,
  open_id       TEXT        NOT NULL REFERENCES feishu_user(open_id) ON DELETE CASCADE,
  author_name   TEXT        NOT NULL,
  content       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS block_comment_production_idx ON block_comment(production_id);
CREATE INDEX IF NOT EXISTS block_comment_block_idx ON block_comment(production_id, block_id);

-- ── Cue lists ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cue_list (
  id                 TEXT PRIMARY KEY,
  production_id      TEXT NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  notes              TEXT NOT NULL DEFAULT '',
  template           TEXT,
  default_edit_roles TEXT[] NOT NULL DEFAULT '{}',
  created_by         TEXT NOT NULL REFERENCES feishu_user(open_id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cue_list_production_idx ON cue_list(production_id, created_at);

CREATE TABLE IF NOT EXISTS cue_list_permission (
  cue_list_id TEXT    NOT NULL REFERENCES cue_list(id) ON DELETE CASCADE,
  open_id     TEXT    NOT NULL REFERENCES feishu_user(open_id) ON DELETE CASCADE,
  can_edit    BOOLEAN NOT NULL,
  PRIMARY KEY (cue_list_id, open_id)
);

-- ── Cues ─────────────────────────────────────────────────────────────────────
-- Anchor kinds: 'block' = precise char offset within a block;
--               'gap'   = the visual whitespace after a block (before next block)
-- Point cue: start == end (both kind+blockId+offset identical)
-- warning: set when drift detection couldn't find a confident match

CREATE TABLE IF NOT EXISTS cue (
  id              TEXT    PRIMARY KEY,
  cue_list_id     TEXT    NOT NULL REFERENCES cue_list(id) ON DELETE CASCADE,
  number          TEXT    NOT NULL,
  name            TEXT    NOT NULL DEFAULT '',
  content         TEXT    NOT NULL DEFAULT '',
  start_kind      TEXT    NOT NULL CHECK(start_kind IN ('block','gap')),
  start_block_id  TEXT    NOT NULL,
  start_offset    INTEGER,            -- null when start_kind='gap'
  end_kind        TEXT    NOT NULL CHECK(end_kind IN ('block','gap')),
  end_block_id    TEXT    NOT NULL,
  end_offset      INTEGER,            -- null when end_kind='gap'
  warning         BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(cue_list_id, number)
);

CREATE INDEX IF NOT EXISTS cue_list_idx ON cue(cue_list_id);

-- ── Per-member permission overrides ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_member_permission (
  production_id TEXT NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  open_id       TEXT NOT NULL REFERENCES feishu_user(open_id) ON DELETE CASCADE,
  permission    TEXT NOT NULL,
  granted       BOOLEAN NOT NULL,
  PRIMARY KEY (production_id, open_id, permission)
);
