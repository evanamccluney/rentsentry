ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean DEFAULT false;
