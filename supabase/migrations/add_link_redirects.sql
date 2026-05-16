CREATE TABLE IF NOT EXISTS link_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(10) UNIQUE NOT NULL,
  url text NOT NULL,
  type varchar(50),
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS link_redirects_code_idx ON link_redirects (code);
