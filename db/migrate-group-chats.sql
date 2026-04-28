-- Add chat_id columns for Feishu group bindings.
-- Idempotent.
ALTER TABLE event_department  ADD COLUMN IF NOT EXISTS chat_id TEXT;
ALTER TABLE production_event  ADD COLUMN IF NOT EXISTS chat_id TEXT;
ALTER TABLE event_tech_req    ADD COLUMN IF NOT EXISTS chat_id TEXT;
