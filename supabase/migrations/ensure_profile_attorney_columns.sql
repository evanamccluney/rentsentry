ALTER TABLE profiles ADD COLUMN IF NOT EXISTS attorney_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS attorney_email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS attorney_phone text;

NOTIFY pgrst, 'reload schema';
