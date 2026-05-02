-- Cedar Capital — Migration 013
-- Operator-selectable ARV bound (low / mid / high). NULL = auto-pick.
-- The deal analyzer reads this column and uses arv_low / arv_mid / arv_high
-- accordingly when computing rehab + MAO + downstream numbers.
-- Idempotent.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS arv_bound text;

ALTER TABLE properties
  DROP CONSTRAINT IF EXISTS properties_arv_bound_valid;
ALTER TABLE properties
  ADD CONSTRAINT properties_arv_bound_valid
  CHECK (arv_bound IS NULL OR arv_bound IN ('low', 'mid', 'high'));
