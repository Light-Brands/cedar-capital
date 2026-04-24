-- Cedar Capital — Migration 006
-- Persist per-comp distance (miles) so the UI can show how far each
-- comparable sale is from the subject property.
-- Idempotent.

ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS comp_distances numeric[];
