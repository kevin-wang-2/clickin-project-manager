-- Add aggregate flag and metadata fields to character table
ALTER TABLE character ADD COLUMN IF NOT EXISTS is_aggregate BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE character ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE character ADD COLUMN IF NOT EXISTS biography TEXT;
ALTER TABLE character ADD COLUMN IF NOT EXISTS role_type TEXT;

-- Aggregate character membership
CREATE TABLE IF NOT EXISTS character_aggregate (
  aggregate_id TEXT NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  member_id    TEXT NOT NULL REFERENCES character(id) ON DELETE CASCADE,
  PRIMARY KEY (aggregate_id, member_id)
);
