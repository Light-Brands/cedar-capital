-- Cedar Capital — Migration 007
-- ATTOM-derived data tables: comps, building permits, sale history, call log.
-- The trial subscription doesn't include /sale/comparables, but it does
-- include /sale/snapshot — which means we can pull all recent sales by zip
-- and self-compute comps. This migration creates the storage.
--
-- Idempotent.

-- ============================================================
-- attom_sales: every sale ATTOM returns from /sale/snapshot
-- This is our self-computed comps source.
-- ============================================================
CREATE TABLE IF NOT EXISTS attom_sales (
  attom_id            text PRIMARY KEY,           -- one row per ATTOM property identifier
  address             text NOT NULL,
  city                text,
  state               text,
  zip_code            text NOT NULL,
  county              text,
  lat                 numeric,
  lng                 numeric,
  beds                int,
  baths               numeric,
  sqft                int,
  lot_size            numeric,
  year_built          int,
  property_type       text,
  sale_amount         numeric,
  sale_date           date,
  sale_type           text,                       -- ATTOM saleType (Resale, FCSale, etc.)
  raw                 jsonb NOT NULL,
  ingested_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attom_sales_zip       ON attom_sales(zip_code);
CREATE INDEX IF NOT EXISTS idx_attom_sales_sale_date ON attom_sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_attom_sales_lat_lng   ON attom_sales(lat, lng);
CREATE INDEX IF NOT EXISTS idx_attom_sales_sqft      ON attom_sales(sqft);

-- ============================================================
-- attom_building_permits: per-property permit history
-- /property/buildingpermits returns array of permits per address.
-- Recent permit activity = recent investment (less rehab needed).
-- No permits in 20 years = deferred maintenance signal.
-- ============================================================
CREATE TABLE IF NOT EXISTS attom_building_permits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attom_id        text NOT NULL,
  property_id     uuid REFERENCES properties(id) ON DELETE CASCADE,
  permit_number   text,
  permit_type     text,
  description     text,
  effective_date  date,
  amount          numeric,
  raw             jsonb NOT NULL,
  ingested_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attom_permits_attom_id    ON attom_building_permits(attom_id);
CREATE INDEX IF NOT EXISTS idx_attom_permits_property_id ON attom_building_permits(property_id);
CREATE INDEX IF NOT EXISTS idx_attom_permits_date        ON attom_building_permits(effective_date DESC);

-- ============================================================
-- attom_call_log: track every ATTOM API call for budget visibility
-- ============================================================
CREATE TABLE IF NOT EXISTS attom_call_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint     text NOT NULL,
  status_code  int,
  bytes        int,
  duration_ms  int,
  property_id  uuid,
  notes        text,
  called_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attom_calls_endpoint  ON attom_call_log(endpoint);
CREATE INDEX IF NOT EXISTS idx_attom_calls_called_at ON attom_call_log(called_at DESC);

-- ============================================================
-- Self-computed comps: function that returns ranked sale comps
-- for a target property from attom_sales. Mirrors the manual
-- "progressive radius widening" logic from src/lib/analysis/comps.ts.
-- ============================================================
CREATE OR REPLACE FUNCTION compute_attom_comps(
  target_zip       text,
  target_sqft      int,
  target_beds      int DEFAULT NULL,
  sqft_tolerance   numeric DEFAULT 0.20,        -- ±20% sqft band
  months_back      int DEFAULT 12,              -- look at sales within last N months
  max_comps        int DEFAULT 10
)
RETURNS TABLE (
  attom_id      text,
  address       text,
  sale_amount   numeric,
  sale_date     date,
  sqft          int,
  beds          int,
  price_per_sqft numeric
) AS $$
  SELECT
    s.attom_id,
    s.address,
    s.sale_amount,
    s.sale_date,
    s.sqft,
    s.beds,
    ROUND((s.sale_amount / NULLIF(s.sqft, 0))::numeric, 2) AS price_per_sqft
  FROM attom_sales s
  WHERE s.zip_code = target_zip
    AND s.sale_amount > 0
    AND s.sqft > 0
    AND s.sale_date >= CURRENT_DATE - (months_back || ' months')::interval
    AND s.sqft BETWEEN target_sqft * (1 - sqft_tolerance) AND target_sqft * (1 + sqft_tolerance)
    AND (target_beds IS NULL OR s.beds = target_beds OR s.beds IS NULL)
  ORDER BY s.sale_date DESC
  LIMIT max_comps;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION compute_attom_comps IS
  'Cedar Capital — synthetic comps from ATTOM /sale/snapshot. Returns up to max_comps recent sales matching target zip + sqft band + bed count. Use price_per_sqft × subject_sqft for ARV signal.';
