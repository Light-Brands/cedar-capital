-- Cedar Capital — Migration 008
-- Add rental AVM columns + comprehensive ATTOM owner/mortgage fields.
-- Idempotent.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS attom_rental_avm numeric,            -- monthly rent estimate
  ADD COLUMN IF NOT EXISTS attom_rental_low numeric,
  ADD COLUMN IF NOT EXISTS attom_rental_high numeric,
  ADD COLUMN IF NOT EXISTS attom_owner_name text,
  ADD COLUMN IF NOT EXISTS attom_owner_mailing text,
  ADD COLUMN IF NOT EXISTS attom_owner_type text,
  ADD COLUMN IF NOT EXISTS attom_mortgage_lender text,
  ADD COLUMN IF NOT EXISTS attom_mortgage_origination_date date,
  ADD COLUMN IF NOT EXISTS attom_mortgage_amount numeric,
  ADD COLUMN IF NOT EXISTS attom_permit_count int,
  ADD COLUMN IF NOT EXISTS attom_latest_permit_date date,
  ADD COLUMN IF NOT EXISTS attom_recent_permit_value numeric;

CREATE INDEX IF NOT EXISTS idx_properties_attom_rental_avm ON properties(attom_rental_avm);
CREATE INDEX IF NOT EXISTS idx_properties_attom_latest_permit_date ON properties(attom_latest_permit_date DESC);
