CREATE TABLE IF NOT EXISTS event_report_reply (
  id          TEXT PRIMARY KEY,
  report_id   TEXT NOT NULL REFERENCES event_report(id) ON DELETE CASCADE,
  parent_type TEXT NOT NULL CHECK (parent_type IN ('report', 'note', 'reply')),
  parent_id   TEXT NOT NULL,
  open_id     TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_report_reply_report_id
  ON event_report_reply(report_id);
