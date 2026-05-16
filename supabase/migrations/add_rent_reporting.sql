ALTER TABLE tenants ADD COLUMN IF NOT EXISTS rent_reporting_opted_in boolean DEFAULT false;
