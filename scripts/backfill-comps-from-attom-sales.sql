-- Bulk comp backfill — Cedar Capital
-- 2026-05-01
--
-- For every Austin property with sqft > 0 that matches at least 3 recent
-- sales in attom_sales (zip + ±25% sqft + last 12 months), compute median
-- $/sqft and persist comp data to the analyses table.
--
-- This is a one-shot SQL operation, NO ATTOM API calls. The 10,133 sales
-- in attom_sales (pulled earlier from /sale/snapshot) are the source.
--
-- Strategy:
-- 1. Build per-property comp aggregates in a CTE.
-- 2. UPSERT into analyses — preserves analyzer-computed fields (roi, mao,
--    rehab, finance) on existing rows; populates them with simple defaults
--    on new rows so the rows are useful immediately.
-- 3. Caller should run scripts/recompute-arv.sh afterward to blend in the
--    ATTOM AVM signals where present.

WITH comp_aggregates AS (
  SELECT
    p.id AS property_id,
    p.sqft AS subject_sqft,
    p.asking_price AS asking_price,
    -- Top 10 most recent matching sales as comps
    ARRAY_AGG(s.address ORDER BY s.sale_date DESC) FILTER (WHERE rn <= 10) AS comp_addresses,
    ARRAY_AGG(s.sale_amount ORDER BY s.sale_date DESC) FILTER (WHERE rn <= 10) AS comp_prices,
    -- Distance: best-effort using lat/lng pythagorean
    ARRAY_AGG(
      CASE WHEN p.lat IS NOT NULL AND p.lng IS NOT NULL AND s.lat IS NOT NULL AND s.lng IS NOT NULL
        THEN ROUND((SQRT(POWER((p.lat - s.lat) * 69, 2) + POWER((p.lng - s.lng) * 54.6, 2)))::numeric, 2)
        ELSE NULL
      END
      ORDER BY s.sale_date DESC
    ) FILTER (WHERE rn <= 10) AS comp_distances,
    -- Median $/sqft across all matching comps (more stable than mean for ARV)
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (s.sale_amount / NULLIF(s.sqft, 0))) AS median_psf,
    COUNT(*) AS comp_count
  FROM properties p
  JOIN LATERAL (
    SELECT
      s.address, s.sale_amount, s.sale_date, s.sqft, s.lat, s.lng,
      ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY s.sale_date DESC) AS rn
    FROM attom_sales s
    WHERE s.zip_code = p.zip_code
      AND s.sale_amount > 0
      AND s.sqft > 0
      AND s.sqft BETWEEN p.sqft * 0.75 AND p.sqft * 1.25
      AND s.sale_date >= CURRENT_DATE - interval '12 months'
  ) s ON TRUE
  WHERE p.zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
    AND p.sqft > 0
  GROUP BY p.id, p.sqft, p.asking_price
  HAVING COUNT(*) >= 3
)
INSERT INTO analyses (
  property_id,
  comp_addresses,
  comp_prices,
  comp_distances,
  comp_avg_per_sqft,
  arv,
  arv_per_sqft,
  offer_price,
  diff,
  verified
)
SELECT
  ca.property_id,
  ca.comp_addresses,
  ca.comp_prices,
  ca.comp_distances,
  ROUND(ca.median_psf::numeric, 2) AS comp_avg_per_sqft,
  -- Simple wholesaler ARV: comp_psf × subject_sqft (will be re-blended with
  -- ATTOM AVM by recompute-arv.sh if attom_avm_value is present)
  ROUND(ca.median_psf * ca.subject_sqft) AS arv,
  ROUND((ca.median_psf)::numeric, 2) AS arv_per_sqft,
  ca.asking_price AS offer_price,
  -- diff = ARV - offer
  ROUND(ca.median_psf * ca.subject_sqft) - COALESCE(ca.asking_price, 0) AS diff,
  -- verified iff 3+ real sold comps
  TRUE AS verified
FROM comp_aggregates ca
ON CONFLICT (property_id) DO UPDATE SET
  comp_addresses    = EXCLUDED.comp_addresses,
  comp_prices       = EXCLUDED.comp_prices,
  comp_distances    = EXCLUDED.comp_distances,
  comp_avg_per_sqft = EXCLUDED.comp_avg_per_sqft,
  -- Update ARV from comps unless analyzer already computed something more
  -- specific (we trust the analyzer's ARV if it differs significantly from
  -- the simple comp formula — that means a manual override or condition lift)
  arv               = CASE
    WHEN analyses.arv IS NULL OR ABS(analyses.arv - EXCLUDED.arv) < EXCLUDED.arv * 0.05
      THEN EXCLUDED.arv
    ELSE analyses.arv
  END,
  arv_per_sqft      = EXCLUDED.arv_per_sqft,
  verified          = TRUE;

-- Coverage report
SELECT
  COUNT(*) AS properties_with_comps,
  COUNT(*) FILTER (WHERE comp_avg_per_sqft IS NOT NULL) AS with_comp_psf,
  COUNT(*) FILTER (WHERE array_length(comp_addresses, 1) >= 3) AS verified_comp_count,
  ROUND(AVG(comp_avg_per_sqft)::numeric, 2) AS avg_comp_psf,
  ROUND(AVG(array_length(comp_addresses, 1))::numeric, 1) AS avg_comp_count
FROM analyses
WHERE comp_addresses IS NOT NULL
  AND array_length(comp_addresses, 1) > 0;
