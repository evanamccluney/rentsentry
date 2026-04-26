-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS late_fee_percent numeric(4,2) DEFAULT 5.0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pm_display_name text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notes text;
