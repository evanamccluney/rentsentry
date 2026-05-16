ALTER TABLE tenants ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;
