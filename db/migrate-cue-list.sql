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
