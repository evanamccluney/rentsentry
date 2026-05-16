ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auto_mode boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auto_payment_plan_offers boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_rent_due_day smallint DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pm_alert_triggers jsonb DEFAULT '["pay_or_quit","legal","installment_missed","autopay_declined"]'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pm_phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pm_alerts_enabled boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS late_fee_percent numeric(4,2) DEFAULT 5.0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS late_fee_day integer DEFAULT 5;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pm_display_name text;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS escalation_preset text DEFAULT 'professional';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reminder_day integer DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_plan_day integer DEFAULT 5;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pay_or_quit_day integer DEFAULT 5;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cfk_review_day integer DEFAULT 21;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS attorney_review_day integer DEFAULT 30;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pre_due_risk_outreach_enabled boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pre_due_risk_review_days_before_due integer DEFAULT 5;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS repeat_offender_accelerator_days integer DEFAULT 7;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS require_attorney_before_notice boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_plan_before_notice boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_escalation_notes text;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS attorney_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS attorney_email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS attorney_phone text;

NOTIFY pgrst, 'reload schema';
