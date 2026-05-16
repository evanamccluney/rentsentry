UPDATE tenants
SET delinquency_start_date =
  make_date(
    EXTRACT(YEAR FROM CURRENT_DATE)::int,
    EXTRACT(MONTH FROM CURRENT_DATE)::int,
    LEAST(GREATEST(COALESCE(rent_due_day, 1), 1), 28)
  )
WHERE COALESCE(balance_due, 0) > 0
  AND delinquency_start_date IS NULL
  AND EXTRACT(DAY FROM CURRENT_DATE)::int >= LEAST(GREATEST(COALESCE(rent_due_day, 1), 1), 28);
