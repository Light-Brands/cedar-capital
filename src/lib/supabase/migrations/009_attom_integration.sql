-- Cedar Capital — Migration 006
-- ATTOM data integration + listing description capture + multi-signal ARV.
-- Layered on TCAD enrichment (004) and manual enrichment (005).
-- Idempotent.

-- ============================================================
-- ATTOM raw + extracted fields on properties
-- ============================================================
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS attom_id text,
  ADD COLUMN IF NOT EXISTS attom_data jsonb,
  ADD COLUMN IF NOT EXISTS attom_avm jsonb,
  ADD COLUMN IF NOT EXISTS attom_avm_value numeric,
  ADD COLUMN IF NOT EXISTS attom_avm_low numeric,
  ADD COLUMN IF NOT EXISTS attom_avm_high numeric,
  ADD COLUMN IF NOT EXISTS attom_avm_score int,
  ADD COLUMN IF NOT EXISTS attom_ltv numeric,
  ADD COLUMN IF NOT EXISTS attom_lendable_equity numeric,
  ADD COLUMN IF NOT EXISTS attom_total_loan_balance numeric,
  ADD COLUMN IF NOT EXISTS attom_condition text,
  ADD COLUMN IF NOT EXISTS attom_quality text,
  ADD COLUMN IF NOT EXISTS attom_year_built_effective int,
  ADD COLUMN IF NOT EXISTS attom_absentee_ind text,
  ADD COLUMN IF NOT EXISTS attom_last_synced_at timestamptz;

-- attomId is the stable cross-source dedup key; index for fast lookup.
CREATE INDEX IF NOT EXISTS idx_properties_attom_id ON properties(attom_id);
CREATE INDEX IF NOT EXISTS idx_properties_attom_avm_value ON properties(attom_avm_value);

-- ============================================================
-- Listing description capture + classification
-- ============================================================
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS description_source text,            -- 'mls' | 'rentcast' | 'estated' | 'manual'
  ADD COLUMN IF NOT EXISTS description_categories text[],      -- ['multi_unit','auction',...]
  ADD COLUMN IF NOT EXISTS description_flags jsonb,            -- {is_auction:true, is_multi_unit:false, ...}
  ADD COLUMN IF NOT EXISTS description_classified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_properties_description_categories
  ON properties USING gin(description_categories);

-- ============================================================
-- Multi-signal ARV (range, not single-point)
-- ============================================================
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS arv_low numeric,
  ADD COLUMN IF NOT EXISTS arv_mid numeric,
  ADD COLUMN IF NOT EXISTS arv_high numeric,
  ADD COLUMN IF NOT EXISTS arv_confidence text,                -- 'high' | 'medium' | 'low'
  ADD COLUMN IF NOT EXISTS arv_signals jsonb,                  -- provenance: which inputs voted for which value
  ADD COLUMN IF NOT EXISTS arv_calculated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_properties_arv_mid ON properties(arv_mid);
