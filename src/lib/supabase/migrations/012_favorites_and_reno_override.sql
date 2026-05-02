-- Cedar Capital — Migration 012
-- Adds favorites + reno-percentage override.
-- Idempotent.

-- ============================================================
-- Favorites — single-tenant boolean for now. When auth lands,
-- replace with a (user_id, property_id) join table without
-- breaking the UI surface (the star icon stays the same).
-- ============================================================
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS favorited_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_properties_is_favorite ON properties(is_favorite) WHERE is_favorite = true;

-- ============================================================
-- Reno percentage override — operator-set rehab budget as %
-- of ARV (5-30%). NULL means "use the auto-estimated rehab".
-- When set, the analyzer multiplies arv × pct/100 to get
-- rehab_total, overriding line-item estimates.
-- ============================================================
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS reno_override_pct numeric;

-- Constraint to keep values in the operator-meaningful range
ALTER TABLE properties
  DROP CONSTRAINT IF EXISTS properties_reno_override_pct_range;
ALTER TABLE properties
  ADD CONSTRAINT properties_reno_override_pct_range
  CHECK (reno_override_pct IS NULL OR (reno_override_pct >= 1 AND reno_override_pct <= 50));
