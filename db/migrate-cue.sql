-- Migration: add cue table
-- Run: psql -d <db> -f migrate-cue.sql

CREATE TABLE IF NOT EXISTS cue (
  id              TEXT    PRIMARY KEY,
  cue_list_id     TEXT    NOT NULL REFERENCES cue_list(id) ON DELETE CASCADE,
  number          TEXT    NOT NULL,
  name            TEXT    NOT NULL DEFAULT '',
  content         TEXT    NOT NULL DEFAULT '',
  start_kind      TEXT    NOT NULL CHECK(start_kind IN ('block','gap')),
  start_block_id  TEXT    NOT NULL,
  start_offset    INTEGER,
  end_kind        TEXT    NOT NULL CHECK(end_kind IN ('block','gap')),
  end_block_id    TEXT    NOT NULL,
  end_offset      INTEGER,
  warning         BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(cue_list_id, number)
);

CREATE INDEX IF NOT EXISTS cue_list_idx ON cue(cue_list_id);
