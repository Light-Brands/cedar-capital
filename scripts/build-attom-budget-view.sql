-- ATTOM call budget visibility — Cedar Capital
-- Surfaces total calls by endpoint, last 24h burn rate, and projected runway
-- against a guessed daily cap. Adjust DAILY_CAP_GUESS via session var if you
-- learn the actual cap from the ATTOM dashboard.

CREATE OR REPLACE VIEW attom_budget AS
SELECT
  endpoint,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE called_at > NOW() - interval '24 hours') AS calls_last_24h,
  COUNT(*) FILTER (WHERE called_at > NOW() - interval '1 hour') AS calls_last_1h,
  SUM(bytes) AS total_bytes,
  MAX(called_at) AS last_call_at,
  CASE WHEN endpoint = 'TOTAL' THEN 1 ELSE 0 END AS sort_key
FROM (
  SELECT endpoint, called_at, bytes FROM attom_call_log
  UNION ALL
  SELECT 'TOTAL' AS endpoint, called_at, bytes FROM attom_call_log
) all_rows
GROUP BY endpoint
ORDER BY sort_key, total_calls DESC;

-- Coverage view: percentage of Austin properties enriched per data type
CREATE OR REPLACE VIEW attom_coverage AS
WITH austin AS (
  SELECT * FROM properties
  WHERE zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
)
SELECT
  COUNT(*) AS austin_total,
  COUNT(*) FILTER (WHERE attom_id IS NOT NULL)              AS attom_id,
  COUNT(*) FILTER (WHERE attom_avm_value IS NOT NULL)       AS avm,
  COUNT(*) FILTER (WHERE attom_owner_name IS NOT NULL)      AS owner,
  COUNT(*) FILTER (WHERE attom_mortgage_lender IS NOT NULL) AS mortgage,
  COUNT(*) FILTER (WHERE attom_rental_avm IS NOT NULL)      AS rental,
  COUNT(*) FILTER (WHERE attom_permit_count IS NOT NULL)    AS permits,
  COUNT(*) FILTER (WHERE attom_ltv IS NOT NULL)             AS ltv,
  COUNT(*) FILTER (WHERE arv_mid IS NOT NULL)               AS arv_range,
  COUNT(*) FILTER (WHERE arv_confidence = 'high')           AS arv_high,
  COUNT(*) FILTER (WHERE arv_confidence = 'medium')         AS arv_medium,
  COUNT(*) FILTER (WHERE arv_confidence = 'low')            AS arv_low,
  COUNT(*) FILTER (WHERE array_length(description_categories, 1) > 0) AS classified,
  COUNT(*) FILTER (WHERE 'distressed' = ANY(description_categories))  AS distressed,
  COUNT(*) FILTER (WHERE 'multi_unit' = ANY(description_categories))  AS multi_unit
FROM austin;
