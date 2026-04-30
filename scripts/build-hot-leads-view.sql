-- Hot Leads View — Cedar Capital
-- 2026-04-30
--
-- A view (not a materialized view — recomputes on every read) ranking Austin
-- properties by motivated-seller signal strength. Inputs:
--   • description_categories  → distressed / multi_unit / mobile / land
--   • attom_ltv               → equity proxy (lower LTV = more equity = more flexible)
--   • attom_lendable_equity   → absolute $ available
--   • attom_condition         → POOR/FAIR = rehab opportunity
--   • is_absentee             → out-of-area owner = motivated
--   • distress_signal         → BatchData skip-trace flag
--   • analyses.deal_score_numeric → existing deal score
--
-- The hot_score is a 0-100 composite. Tune weights as we learn what closes.

CREATE OR REPLACE VIEW hot_leads AS
SELECT
  p.id,
  p.address,
  p.city,
  p.zip_code,
  p.beds,
  p.baths,
  p.sqft,
  p.year_built,
  p.asking_price,
  p.market_value AS tcad_market_value,
  p.attom_avm_value,
  p.arv_mid,
  p.arv_low,
  p.arv_high,
  p.arv_confidence,
  p.attom_ltv,
  p.attom_lendable_equity,
  p.attom_condition,
  p.attom_absentee_ind,
  p.is_absentee AS tcad_is_absentee,
  p.owner_name,
  p.distress_signal,
  p.description_categories,
  p.listing_status,
  p.last_enriched_at,
  p.attom_last_synced_at,
  a.deal_score_numeric,
  a.badge,
  a.roi,
  a.mao,
  a.wholesale_profit,
  -- Hot score: 0-100 composite, higher = hotter
  LEAST(100,
    -- Distress bucket (0-30)
    CASE WHEN 'distressed' = ANY(p.description_categories) THEN 25 ELSE 0 END
    + CASE WHEN p.distress_signal IS NOT NULL THEN 5 ELSE 0 END
    -- Equity bucket (0-25): low LTV = high equity = motivated
    + CASE
        WHEN p.attom_ltv IS NULL THEN 0
        WHEN p.attom_ltv = 0 THEN 25       -- free and clear
        WHEN p.attom_ltv <= 30 THEN 20     -- high equity
        WHEN p.attom_ltv <= 50 THEN 12
        WHEN p.attom_ltv <= 70 THEN 5
        ELSE 0
      END
    -- Multi-unit bucket (0-15): cap-rate signal
    + CASE WHEN 'multi_unit' = ANY(p.description_categories) THEN 15 ELSE 0 END
    -- Condition bucket (0-15): worse condition = more rehab upside
    + CASE UPPER(COALESCE(p.attom_condition, ''))
        WHEN 'POOR'    THEN 15
        WHEN 'UNSOUND' THEN 15
        WHEN 'FAIR'    THEN 10
        WHEN 'AVERAGE' THEN 4
        ELSE 0
      END
    -- Absenteeism bucket (0-10): out-of-area owners are easier to convert
    + CASE
        WHEN p.attom_absentee_ind = 'ABSENTEE' THEN 10
        WHEN p.is_absentee = true THEN 7
        ELSE 0
      END
    -- Existing deal score bucket (0-15): proven engine signal
    + LEAST(15, COALESCE(a.deal_score_numeric, 0) / 7)
  ) AS hot_score
FROM properties p
LEFT JOIN analyses a ON a.property_id = p.id
WHERE
  p.zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
  -- Filter out cruft: must have either a category OR an enrichment signal
  AND (
    array_length(p.description_categories, 1) > 0
    OR p.attom_id IS NOT NULL
    OR p.distress_signal IS NOT NULL
    OR p.is_absentee = true
  )
ORDER BY hot_score DESC, COALESCE(a.deal_score_numeric, 0) DESC;

-- Index recommendations to keep the view snappy:
--   idx_properties_attom_id (already exists from migration 006)
--   idx_properties_description_categories (gin, exists)
--   idx_properties_zip (exists)
-- No additional indexes needed; the view filters use existing indexes.

COMMENT ON VIEW hot_leads IS
  'Cedar Capital hot leads ranking — Austin only. Composite hot_score 0-100 from distress, equity, multi-unit, condition, absenteeism, and existing deal score. View recomputes per query so changes to underlying data flow through without refresh.';
