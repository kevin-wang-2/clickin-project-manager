CREATE TABLE IF NOT EXISTS event_report_read (
  report_id TEXT NOT NULL REFERENCES event_report(id) ON DELETE CASCADE,
  open_id   TEXT NOT NULL,
  read_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, open_id)
);
