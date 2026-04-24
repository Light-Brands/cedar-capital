-- Cedar Capital — Migration 003
-- Dedupe analyses and add UNIQUE(property_id) so upsert works.
-- Date: 2026-04-24
-- Safe to re-run.

-- Step 1: Dedupe — keep only the newest analysis per property
DELETE FROM analyses a
USING analyses a2
WHERE a.property_id = a2.property_id
  AND a.created_at < a2.created_at;

-- Step 2: Add UNIQUE constraint (idempotent-ish; drop first if exists)
ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_property_id_unique;
ALTER TABLE analyses ADD CONSTRAINT analyses_property_id_unique UNIQUE (property_id);
