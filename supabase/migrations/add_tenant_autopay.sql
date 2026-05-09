ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_payment_method_id text;
