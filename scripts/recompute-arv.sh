#!/usr/bin/env bash
#
# ARV Recompute — Cedar Capital
#
# Runs the multi-signal ARV blend across all Austin properties, populating
# arv_low / arv_mid / arv_high / arv_confidence / arv_signals using whatever
# signals each property has (ATTOM AVM + condition, RentCast comp $/sqft,
# TCAD market_value as floor). Mirrors the JS arv-engine.ts exactly.
#
# Required env:
#   PGURL — postgresql://user:pass@host:port/db
#
# Usage:
#   PGURL=... bash scripts/recompute-arv.sh
#
# Idempotent. Safe to re-run anytime new ATTOM data lands.

set -euo pipefail
: "${PGURL:?PGURL required}"

echo "▸ Recomputing ARV ranges for Austin properties..."

psql "$PGURL" -v ON_ERROR_STOP=1 -c "
-- ARV recompute. Inputs (all may be null):
--   p.attom_avm_value/low/high/score        — as-is AVM signal
--   p.attom_condition                       — lift factor
--   p.market_value                          — TCAD floor
--   p.sqft                                  — needed for comp \$/sqft × sqft
--   a.comp_avg_per_sqft, a.comp_count      — RentCast realized comp signal
--
-- Output:
--   arv_low/arv_mid/arv_high                — blended range
--   arv_confidence                          — 'high' | 'medium' | 'low'
--   arv_signals (jsonb)                     — provenance
--
-- Formula:
--   condFactor = 1.00 (EXCELLENT) ... 1.40 (UNSOUND), default 1.10
--   attomLow/Mid/High = (attom_avm_low/value/high) × condFactor
--   compLow/Mid/High  = comp_psf × sqft × {0.92, 1.00, 1.08}
--   blended           = comps × 0.65 + ATTOM × 0.35 (when both present)
--   tcad floor        = arv_low never below tcad market_value
WITH inputs AS (
  SELECT
    p.id,
    CASE UPPER(COALESCE(p.attom_condition, ''))
      WHEN 'EXCELLENT' THEN 1.00
      WHEN 'GOOD'      THEN 1.05
      WHEN 'AVERAGE'   THEN 1.12
      WHEN 'FAIR'      THEN 1.20
      WHEN 'POOR'      THEN 1.30
      WHEN 'UNSOUND'   THEN 1.40
      ELSE 1.10
    END AS cond_factor,
    p.attom_avm_value AS avm_value,
    COALESCE(p.attom_avm_low,  p.attom_avm_value * 0.90) AS avm_low_raw,
    COALESCE(p.attom_avm_high, p.attom_avm_value * 1.10) AS avm_high_raw,
    p.attom_avm_score AS avm_score,
    p.sqft AS sqft,
    p.market_value AS tcad_mv,
    a.comp_avg_per_sqft AS comp_psf,
    COALESCE(array_length(a.comp_addresses, 1), 0) AS comp_count
  FROM properties p
  LEFT JOIN analyses a ON a.property_id = p.id
  WHERE p.zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
), computed AS (
  SELECT
    id,
    -- ATTOM contribution (lifted by cond_factor)
    avm_value  * cond_factor AS attom_mid,
    avm_low_raw  * cond_factor AS attom_low,
    avm_high_raw * cond_factor AS attom_high,
    -- Comp contribution (no condition lift; comps are already realized)
    comp_psf * sqft AS comp_mid,
    comp_psf * sqft * 0.92 AS comp_low,
    comp_psf * sqft * 1.08 AS comp_high,
    avm_score, comp_count, tcad_mv,
    cond_factor,
    avm_value, comp_psf, sqft
  FROM inputs
), blended AS (
  SELECT
    id,
    avm_score, comp_count, cond_factor, tcad_mv,
    avm_value, comp_psf, sqft,
    attom_mid, attom_low, attom_high,
    comp_mid, comp_low, comp_high,
    -- Blend: if both present, 65% comp + 35% ATTOM. If only one, use that.
    CASE
      WHEN attom_mid IS NOT NULL AND comp_mid IS NOT NULL
        THEN comp_mid * 0.65 + attom_mid * 0.35
      WHEN comp_mid IS NOT NULL THEN comp_mid
      WHEN attom_mid IS NOT NULL THEN attom_mid
      ELSE NULL
    END AS arv_mid,
    CASE
      WHEN attom_low IS NOT NULL AND comp_low IS NOT NULL
        THEN comp_low * 0.65 + attom_low * 0.35
      WHEN comp_low IS NOT NULL THEN comp_low
      WHEN attom_low IS NOT NULL THEN attom_low
      ELSE NULL
    END AS arv_low_unbounded,
    CASE
      WHEN attom_high IS NOT NULL AND comp_high IS NOT NULL
        THEN comp_high * 0.65 + attom_high * 0.35
      WHEN comp_high IS NOT NULL THEN comp_high
      WHEN attom_high IS NOT NULL THEN attom_high
      ELSE NULL
    END AS arv_high
  FROM computed
)
UPDATE properties p SET
  arv_low = ROUND(GREATEST(b.arv_low_unbounded, COALESCE(b.tcad_mv, 0))),
  arv_mid = ROUND(b.arv_mid),
  arv_high = ROUND(b.arv_high),
  arv_confidence = CASE
    WHEN b.attom_mid IS NOT NULL AND b.comp_mid IS NOT NULL
         AND b.comp_count >= 3 AND COALESCE(b.avm_score, 0) >= 70 THEN 'high'
    WHEN (b.attom_mid IS NOT NULL AND b.comp_mid IS NOT NULL)
         OR (b.comp_mid IS NOT NULL AND b.comp_count >= 3)
         OR (b.attom_mid IS NOT NULL AND COALESCE(b.avm_score, 0) >= 70) THEN 'medium'
    ELSE 'low'
  END,
  arv_signals = jsonb_build_object(
    'condition_factor', b.cond_factor,
    'attom_avm_value', b.avm_value,
    'attom_avm_score', b.avm_score,
    'comp_psf', b.comp_psf,
    'comp_count', b.comp_count,
    'tcad_floor', b.tcad_mv,
    'sqft', b.sqft,
    'blend_weights', CASE
      WHEN b.attom_mid IS NOT NULL AND b.comp_mid IS NOT NULL
        THEN jsonb_build_object('comps', 0.65, 'attom', 0.35)
      WHEN b.comp_mid IS NOT NULL THEN jsonb_build_object('comps', 1.00)
      WHEN b.attom_mid IS NOT NULL THEN jsonb_build_object('attom', 1.00)
      ELSE jsonb_build_object()
    END
  ),
  arv_calculated_at = now()
FROM blended b
WHERE p.id = b.id
  AND b.arv_mid IS NOT NULL;

-- Distribution after recompute
SELECT
  arv_confidence,
  COUNT(*) AS n,
  ROUND(AVG(arv_mid)) AS avg_arv_mid,
  ROUND(AVG(arv_high - arv_low)) AS avg_range_width
FROM properties
WHERE city = 'Austin' AND arv_mid IS NOT NULL
GROUP BY arv_confidence ORDER BY arv_confidence;
"
