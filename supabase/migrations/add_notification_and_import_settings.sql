ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_rent_due_day smallint DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pm_alert_triggers jsonb DEFAULT '["pay_or_quit","legal","installment_missed","autopay_declined"]'::jsonb;
