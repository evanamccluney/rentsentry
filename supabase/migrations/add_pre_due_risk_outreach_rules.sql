ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pre_due_risk_outreach_enabled boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pre_due_risk_review_days_before_due integer DEFAULT 5;
