ALTER TABLE tenants ALTER COLUMN property_id DROP NOT NULL;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_property_id_fkey;
ALTER TABLE tenants
  ADD CONSTRAINT tenants_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own their payments" ON payments;
CREATE POLICY "Users own their payments"
  ON payments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
