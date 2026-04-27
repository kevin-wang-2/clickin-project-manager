-- Scheduled notification jobs (currently: daily_call only)
-- One row per event; upserted when event start_time changes.
CREATE TABLE IF NOT EXISTS notification_job (
  id           TEXT PRIMARY KEY,           -- 'dcall_{eventId}'
  type         TEXT NOT NULL CHECK (type IN ('daily_call')),
  event_id     TEXT NOT NULL REFERENCES production_event(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_job_due
  ON notification_job (scheduled_at)
  WHERE processed_at IS NULL;
