ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_account_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_connect_at timestamptz;
