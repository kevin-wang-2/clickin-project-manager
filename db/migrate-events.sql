-- Migration: event management system
-- Run: psql -d <db> -f migrate-events.sql
-- Idempotent: safe to re-run.

-- ── Layer 1: Departments ──────────────────────────────────────────────────────
-- Production-scoped. Explicit depts (音响, 灯光, …) appear in call sheets and
-- report notes. Implicit depts (演员组) are convenience groupings for call
-- selection only.

CREATE TABLE IF NOT EXISTS event_department (
  id            TEXT        PRIMARY KEY,
  production_id TEXT        NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  kind          TEXT        NOT NULL DEFAULT 'dept' CHECK(kind IN ('dept', 'group')),
  -- 'dept'  = 部门: can be mentioned in report notes, shown in call sheet grouping
  -- 'group' = 用户组: convenience grouping for call selection only
  display_order INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_department_production_idx
  ON event_department(production_id, display_order);

-- Production-level department membership. Tracks who belongs to a dept and
-- whether they are a POC. POC is a subset of members; is_poc=true implies
-- membership. Used for call-sheet grouping, tech req visibility/edit, and
-- pre-populating event participants.
CREATE TABLE IF NOT EXISTS event_department_member (
  department_id TEXT    NOT NULL REFERENCES event_department(id) ON DELETE CASCADE,
  open_id       TEXT    NOT NULL REFERENCES feishu_user(open_id) ON DELETE CASCADE,
  is_poc        BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (department_id, open_id)
);

-- ── Layer 2: Main event ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_event (
  id            TEXT        PRIMARY KEY,
  production_id TEXT        NOT NULL REFERENCES production(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  event_type    TEXT        NOT NULL DEFAULT 'custom',
  -- common values: rehearsal | performance | meeting | custom
  -- open-ended TEXT so future types don't require schema changes
  location      TEXT        NOT NULL DEFAULT '',
  start_time    TIMESTAMPTZ,
  end_time      TIMESTAMPTZ,
  status        TEXT        NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published', 'completed', 'cancelled')),
  description   TEXT        NOT NULL DEFAULT '',
  created_by    TEXT        NOT NULL REFERENCES feishu_user(open_id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_event_production_idx
  ON production_event(production_id, start_time);

-- ── Layer 2: Schedule items (sub-events) ─────────────────────────────────────
-- Each row is one slot in the event's running order.
-- item_type is open-ended TEXT for the same reason as event_type.
-- target_scene_id: hard FK for scene-level association (stable).
-- target_block_id: soft TEXT reference for block/rehearsal-mark association
--   (blocks are mutable, no FK to avoid drift issues like cue anchors have).

CREATE TABLE IF NOT EXISTS event_schedule_item (
  id               TEXT        PRIMARY KEY,
  event_id         TEXT        NOT NULL REFERENCES production_event(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  item_type        TEXT        NOT NULL DEFAULT 'custom',
  -- common values: scene_rehearsal | fitting | sound_check | tech_rehearsal |
  --               meeting | break | custom
  start_time       TIMESTAMPTZ,
  end_time         TIMESTAMPTZ,
  location         TEXT        NOT NULL DEFAULT '',
  order_index      INTEGER     NOT NULL DEFAULT 0,
  target_scene_id  TEXT        REFERENCES scene(id) ON DELETE SET NULL,
  target_block_id  TEXT,       -- soft ref: script.id (rehearsal mark block)
  notes            TEXT        NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS event_schedule_item_event_idx
  ON event_schedule_item(event_id, order_index);

-- ── Layer 2b: Schedule item participants ──────────────────────────────────────
-- Each schedule item carries its own participant list.
-- The union of all schedule item participants + tech req assignees for an event
-- is the set of people who need a call time.

CREATE TABLE IF NOT EXISTS schedule_item_participant (
  item_id  TEXT NOT NULL REFERENCES event_schedule_item(id) ON DELETE CASCADE,
  open_id  TEXT NOT NULL REFERENCES feishu_user(open_id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  PRIMARY KEY (item_id, open_id)
);

CREATE INDEX IF NOT EXISTS schedule_item_participant_item_idx
  ON schedule_item_participant(item_id);

-- ── Layer 3: Participants & followers ─────────────────────────────────────────
-- role = 'participant': actively involved, eligible for call times.
-- role = 'follower':    receives plans/reports only, no call time.
-- department_id is optional context for call sheet grouping.

CREATE TABLE IF NOT EXISTS event_participant (
  id            TEXT        PRIMARY KEY,
  event_id      TEXT        NOT NULL REFERENCES production_event(id) ON DELETE CASCADE,
  open_id       TEXT        NOT NULL REFERENCES feishu_user(open_id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  department_id TEXT        REFERENCES event_department(id) ON DELETE SET NULL,
  role          TEXT        NOT NULL DEFAULT 'participant'
                CHECK (role IN ('participant', 'follower')),
  UNIQUE (event_id, open_id)
);

CREATE INDEX IF NOT EXISTS event_participant_event_idx
  ON event_participant(event_id);

-- ── Layer 3: Call times ───────────────────────────────────────────────────────
-- Separate from event_participant: one person may have multiple call times
-- (e.g. fitting at 09:00 then main rehearsal at 10:30).
-- schedule_item_id is a soft suggestion link — the SM picks a sub-event as
-- the anchor when computing a suggested call_at, but can override freely.

CREATE TABLE IF NOT EXISTS event_call_time (
  id               TEXT        PRIMARY KEY,
  event_id         TEXT        NOT NULL REFERENCES production_event(id) ON DELETE CASCADE,
  open_id          TEXT        NOT NULL REFERENCES feishu_user(open_id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  department_id    TEXT        REFERENCES event_department(id) ON DELETE SET NULL,
  call_at          TIMESTAMPTZ NOT NULL,
  schedule_item_id TEXT        REFERENCES event_schedule_item(id) ON DELETE SET NULL,
  notes            TEXT        NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS event_call_time_event_idx
  ON event_call_time(event_id);

-- ── Layer 3: Technical requirements ──────────────────────────────────────────
-- May be linked to the overall event or to a specific schedule item.
-- preset_minutes: how many minutes before the linked item (or event start)
--   the tech setup should begin — used by the frontend to suggest call times.
-- status is intentionally open-ended via TEXT (could add 'wont_do', etc.).

CREATE TABLE IF NOT EXISTS event_tech_req (
  id               TEXT        PRIMARY KEY,
  event_id         TEXT        NOT NULL REFERENCES production_event(id) ON DELETE CASCADE,
  schedule_item_id TEXT        REFERENCES event_schedule_item(id) ON DELETE SET NULL,
  title            TEXT        NOT NULL,
  description      TEXT        NOT NULL DEFAULT '',
  preset_minutes   INTEGER,    -- null = no preset / manual call time
  department_id    TEXT        REFERENCES event_department(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'pending',
  -- common values: pending | in_progress | done
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_tech_req_event_idx
  ON event_tech_req(event_id);

CREATE TABLE IF NOT EXISTS event_tech_assignee (
  req_id   TEXT NOT NULL REFERENCES event_tech_req(id) ON DELETE CASCADE,
  open_id  TEXT NOT NULL REFERENCES feishu_user(open_id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  PRIMARY KEY (req_id, open_id)
);

-- ── Layer 3b: Tech req ↔ schedule item links ──────────────────────────────────
-- A tech req can be linked to multiple schedule items. The union of their start
-- times minus preset_minutes gives the earliest setup window for call-time calc.

CREATE TABLE IF NOT EXISTS event_tech_req_item (
  req_id  TEXT NOT NULL REFERENCES event_tech_req(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES event_schedule_item(id) ON DELETE CASCADE,
  PRIMARY KEY (req_id, item_id)
);

CREATE INDEX IF NOT EXISTS event_tech_req_item_req_idx
  ON event_tech_req_item(req_id);

-- Backfill from legacy schedule_item_id column (idempotent).
INSERT INTO event_tech_req_item (req_id, item_id)
  SELECT id, schedule_item_id FROM event_tech_req WHERE schedule_item_id IS NOT NULL
  ON CONFLICT DO NOTHING;

-- ── Layer 4: Reports ──────────────────────────────────────────────────────────
-- One report per event (typically). published_at = null means draft.
-- report_type is open-ended TEXT.

CREATE TABLE IF NOT EXISTS event_report (
  id           TEXT        PRIMARY KEY,
  event_id     TEXT        NOT NULL REFERENCES production_event(id) ON DELETE CASCADE,
  report_type  TEXT        NOT NULL DEFAULT 'rehearsal',
  -- common values: rehearsal | performance | meeting | custom
  title        TEXT        NOT NULL,
  body         TEXT        NOT NULL DEFAULT '',
  created_by   TEXT        NOT NULL REFERENCES feishu_user(open_id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS event_report_event_idx
  ON event_report(event_id);

-- ── Layer 4: Department notes (within reports) ────────────────────────────────
-- Each row is a note addressed to one department in one report.
-- One author per note (the SM who wrote it).

CREATE TABLE IF NOT EXISTS event_report_note (
  id            TEXT        PRIMARY KEY,
  report_id     TEXT        NOT NULL REFERENCES event_report(id) ON DELETE CASCADE,
  department_id TEXT        NOT NULL REFERENCES event_department(id) ON DELETE CASCADE,
  content       TEXT        NOT NULL,
  author_open_id TEXT       NOT NULL REFERENCES feishu_user(open_id),
  author_name   TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_report_note_report_idx
  ON event_report_note(report_id);

-- ── Stage managers (跟组舞监) on events ──────────────────────────────────────
-- One event may have multiple stage managers (舞台监督 / 助理舞台监督).
-- Relevant for rehearsal/meeting events; designates report authors.
-- name is denormalised for display without a join.

CREATE TABLE IF NOT EXISTS event_stage_manager (
  event_id TEXT NOT NULL REFERENCES production_event(id) ON DELETE CASCADE,
  open_id  TEXT NOT NULL REFERENCES feishu_user(open_id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  PRIMARY KEY (event_id, open_id)
);

CREATE INDEX IF NOT EXISTS event_stage_manager_event_idx
  ON event_stage_manager(event_id);
