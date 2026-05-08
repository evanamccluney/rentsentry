alter table tenants
  add column if not exists lease_grace_days integer default 0,
  add column if not exists notice_service_method text,
  add column if not exists local_protection_notes text;
