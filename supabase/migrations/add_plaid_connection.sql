-- Plaid bank feed integration
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plaid_access_token text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plaid_item_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plaid_cursor text;    -- transaction sync cursor
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plaid_connected_at timestamptz;
