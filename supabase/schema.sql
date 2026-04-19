-- RentSentry Database Schema

-- Properties table
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  address text,
  state text,              -- 2-letter state abbr e.g. "CA" — used for eviction timeline estimates
  total_units integer default 0,
  created_at timestamptz default now()
);

-- Tenants table (populated from CSV upload)
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  unit text not null,
  name text not null,
  email text,
  phone text,
  rent_amount numeric(10,2) default 0,
  lease_start date,
  lease_end date,
  payment_method text, -- 'card', 'ach', 'check', 'unknown'
  card_expiry text,    -- 'MM/YY' format
  days_late_avg integer default 0,
  late_payment_count integer default 0,
  previous_delinquency boolean default false,
  move_in_date date,
  move_out_date date,
  risk_score text default 'green', -- 'green', 'yellow', 'red'
  risk_reasons text[],
  status text default 'active', -- 'active', 'delinquent', 'offboarding', 'vacated'
  balance_due numeric(10,2) default 0,
  rent_due_day integer default 1,      -- day of month rent is due (almost always 1)
  resolution_status text default null, -- 'paid', 'payment_plan', 'eviction_filed', 'vacated', 'collections'
  last_payment_date date,
  utility_billed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Interventions log
create table if not exists interventions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null, -- 'card_expiry_alert', 'split_pay_offer', 'cash_for_keys', 'legal_packet', 'utility_bill'
  status text default 'pending', -- 'pending', 'sent', 'accepted', 'declined', 'completed'
  scheduled_at timestamptz,
  sent_at timestamptz,
  notes text,
  snapshot jsonb,    -- risk state at the moment action was taken (tier, balance, reasons, etc.)
  created_at timestamptz default now()
);

-- Utility audit table
create table if not exists utility_audits (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  unit text not null,
  tenant_name text,
  move_in_date date,
  utility_transfer_date date,
  landlord_paying_since date,
  estimated_monthly_cost numeric(10,2) default 0,
  total_leakage numeric(10,2) default 0,
  status text default 'open', -- 'open', 'billed', 'resolved'
  created_at timestamptz default now()
);

-- CSV upload history
create table if not exists csv_uploads (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  filename text not null,
  rows_imported integer default 0,
  status text default 'processing', -- 'processing', 'complete', 'error'
  error_message text,
  created_at timestamptz default now()
);

-- PM Profiles table (escalation preferences)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  escalation_style text default 'moderate', -- 'lenient', 'moderate', 'aggressive'
  updated_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "Users own their profile" on profiles for all using (auth.uid() = id);

-- Subscriptions table
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text default 'inactive', -- 'active', 'inactive', 'past_due', 'cancelled'
  unit_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS Policies
alter table properties enable row level security;
alter table tenants enable row level security;
alter table interventions enable row level security;
alter table utility_audits enable row level security;
alter table csv_uploads enable row level security;

create policy "Users own their properties" on properties for all using (auth.uid() = user_id);
create policy "Users own their tenants" on tenants for all using (auth.uid() = user_id);
create policy "Users own their interventions" on interventions for all using (auth.uid() = user_id);
create policy "Users own their utility audits" on utility_audits for all using (auth.uid() = user_id);
create policy "Users own their csv uploads" on csv_uploads for all using (auth.uid() = user_id);

alter table subscriptions enable row level security;
create policy "Users own their subscription" on subscriptions for all using (auth.uid() = user_id);
