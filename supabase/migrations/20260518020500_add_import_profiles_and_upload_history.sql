CREATE TABLE IF NOT EXISTS import_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text,
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE import_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their import profile" ON import_profiles;
CREATE POLICY "Users own their import profile"
  ON import_profiles
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE csv_uploads ALTER COLUMN property_id DROP NOT NULL;
