-- Normalize existing tenant phone numbers to E.164 format
-- US 10-digit: 5551234567 or 555-123-4567 → +15551234567
UPDATE tenants
SET phone = '+1' || regexp_replace(phone, '\D', '', 'g')
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%'
  AND length(regexp_replace(phone, '\D', '', 'g')) = 10;

-- US 11-digit starting with 1: 15551234567 → +15551234567
UPDATE tenants
SET phone = '+' || regexp_replace(phone, '\D', '', 'g')
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%'
  AND length(regexp_replace(phone, '\D', '', 'g')) = 11
  AND left(regexp_replace(phone, '\D', '', 'g'), 1) = '1';

-- Remove any phones that couldn't be normalized (garbage data)
UPDATE tenants
SET phone = NULL
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%';
