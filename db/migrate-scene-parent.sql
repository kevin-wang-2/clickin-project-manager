-- Add parent_id to scene for two-level hierarchy support
ALTER TABLE scene ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES scene(id) ON DELETE SET NULL;
