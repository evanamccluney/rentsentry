ALTER TABLE tenants ADD COLUMN IF NOT EXISTS autopay_monthly boolean DEFAULT false;
