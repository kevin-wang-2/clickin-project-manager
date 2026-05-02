ALTER TABLE cue_list ADD COLUMN IF NOT EXISTS abbr TEXT;
ALTER TABLE cue_list DROP CONSTRAINT IF EXISTS cue_list_abbr_production_unique;
ALTER TABLE cue_list ADD CONSTRAINT cue_list_abbr_production_unique UNIQUE (production_id, abbr);
