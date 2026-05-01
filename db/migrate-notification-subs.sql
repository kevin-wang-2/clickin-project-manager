-- Notification subscription preferences per user.
-- Only stores non-default values; absence of a row means the default applies.
-- For DM-type notifications (defaultEnabled=true): a row with enabled=false = opted out.
-- For group-type notifications (defaultEnabled=false): a row with enabled=true = opted in for extra DM.
CREATE TABLE IF NOT EXISTS notification_subscription (
  open_id           TEXT        NOT NULL,
  notification_type TEXT        NOT NULL,
  enabled           BOOLEAN     NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (open_id, notification_type)
);
