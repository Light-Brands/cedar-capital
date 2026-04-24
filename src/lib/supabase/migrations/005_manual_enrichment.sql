-- Cedar Capital — Migration 005
-- Per-row manual enrichment support.
-- Adds: UNIQUE(property_id) on leads so upsert works
--       distress_signal + last_enriched_at on properties
-- Idempotent.

-- Dedupe leads per property (keep newest) so the UNIQUE add can land
DELETE FROM leads
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY property_id
             ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM leads
  ) t
  WHERE rn > 1
);

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_property_id_unique;
ALTER TABLE leads ADD CONSTRAINT leads_property_id_unique UNIQUE (property_id);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS distress_signal text,
  ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_properties_distress_signal ON properties(distress_signal);
