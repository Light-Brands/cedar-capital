-- Cedar Capital — Migration 004
-- TCAD (Travis Central Appraisal District) public data enrichment.
-- Adds owner records, tax assessment, and market value fields to properties.
-- Date: 2026-04-24
-- Idempotent.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS tcad_prop_id text,
  ADD COLUMN IF NOT EXISTS tcad_geo_id text,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS owner_mailing_address text,
  ADD COLUMN IF NOT EXISTS is_absentee boolean,
  ADD COLUMN IF NOT EXISTS has_homestead_exemption boolean,
  ADD COLUMN IF NOT EXISTS market_value numeric,
  ADD COLUMN IF NOT EXISTS appraised_value numeric,
  ADD COLUMN IF NOT EXISTS deed_date date,
  ADD COLUMN IF NOT EXISTS tcad_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_properties_tcad_prop_id ON properties(tcad_prop_id);
CREATE INDEX IF NOT EXISTS idx_properties_is_absentee ON properties(is_absentee);
CREATE INDEX IF NOT EXISTS idx_properties_has_homestead ON properties(has_homestead_exemption);
CREATE INDEX IF NOT EXISTS idx_properties_market_value ON properties(market_value);
