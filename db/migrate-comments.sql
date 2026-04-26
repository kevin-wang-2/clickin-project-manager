-- Replace block_comment with a generalised comment table.
-- Supports threading (parent_id), polymorphic context (context_type + context_id),
-- and structured @-mention data (mentions JSONB) for future digest / AI queries.

CREATE TABLE IF NOT EXISTS comment (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  production_id TEXT        NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  context_type  TEXT        NOT NULL DEFAULT 'block',   -- 'block' | 'cue' | …
  context_id    TEXT        NOT NULL,                    -- blockId / cueId / …
  parent_id     TEXT        REFERENCES comment(id) ON DELETE CASCADE,
  open_id       TEXT        NOT NULL REFERENCES feishu_user(open_id) ON DELETE CASCADE,
  author_name   TEXT        NOT NULL,
  body          TEXT        NOT NULL,
  mentions      JSONB       NOT NULL DEFAULT '[]',       -- [{openId, name}]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comment_context_idx    ON comment(context_type, context_id);
CREATE INDEX IF NOT EXISTS comment_production_idx ON comment(production_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comment_mentions_idx   ON comment USING GIN(mentions);

-- Migrate existing block_comment rows
INSERT INTO comment (id, production_id, context_type, context_id, open_id, author_name, body, created_at, updated_at)
SELECT id, production_id, 'block', block_id, open_id, author_name, content, created_at, updated_at
FROM block_comment
ON CONFLICT (id) DO NOTHING;
