ALTER TABLE tenants ADD COLUMN IF NOT EXISTS delinquency_start_date date;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS intake_status text DEFAULT 'normal';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS intake_action text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_contact_approved boolean DEFAULT true;

UPDATE tenants
SET
  intake_status = 'normal',
  auto_contact_approved = true
WHERE COALESCE(balance_due, 0) <= 0
  AND (intake_status IS NULL OR intake_status = 'normal')
  AND auto_contact_approved IS NOT TRUE;

UPDATE tenants
SET
  intake_status = 'normal',
  auto_contact_approved = true
WHERE auto_contact_approved IS NOT TRUE
  AND intake_status IS DISTINCT FROM 'needs_review';

UPDATE tenants
SET
  intake_status = 'normal',
  intake_action = null,
  auto_contact_approved = true
WHERE auto_contact_approved IS NOT TRUE
  AND intake_action = 'review_first';

NOTIFY pgrst, 'reload schema';
