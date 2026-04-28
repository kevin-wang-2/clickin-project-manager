-- Add @mention tracking to reports and notes
ALTER TABLE event_report ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]';
ALTER TABLE event_report_note ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]';
