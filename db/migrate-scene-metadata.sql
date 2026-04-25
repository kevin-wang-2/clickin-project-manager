-- Add scene metadata fields
ALTER TABLE scene
  ADD COLUMN IF NOT EXISTS synopsis          TEXT,
  ADD COLUMN IF NOT EXISTS action_line       TEXT,
  ADD COLUMN IF NOT EXISTS music             TEXT,
  ADD COLUMN IF NOT EXISTS stage_notes       TEXT,
  ADD COLUMN IF NOT EXISTS expected_duration TEXT;
