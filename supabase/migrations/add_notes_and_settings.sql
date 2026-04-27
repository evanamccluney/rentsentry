-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- Profiles: new columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auto_mode boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pm_phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pm_alerts_enabled boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS late_fee_percent numeric(4,2) DEFAULT 5.0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pm_display_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarded boolean DEFAULT false;

-- Tenants: notes column
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notes text;
