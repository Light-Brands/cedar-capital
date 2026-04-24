-- ============================================================
-- Cedar Capital — Lead Flow Phase 1
-- Migration 001: Kelly's 36-col parity + Lead Source Monitor
-- Date: 2026-04-23
-- ============================================================
-- Prerequisite: src/lib/supabase/schema.sql must be applied first.
-- This migration is idempotent: safe to re-run.
-- Every change is additive: no drops, no renames.

-- ============================================================
-- Section 1: properties — Kelly 36-col parity
-- ============================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS special_features text[],
  ADD COLUMN IF NOT EXISTS agent_name text,
  ADD COLUMN IF NOT EXISTS agent_phone text,
  ADD COLUMN IF NOT EXISTS agent_email text,
  ADD COLUMN IF NOT EXISTS listing_status text DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS licensing_tag text;

-- Constraints (drop+add to stay idempotent)
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_listing_status_check;
ALTER TABLE properties ADD CONSTRAINT properties_listing_status_check
  CHECK (listing_status IN ('Active','Pending','Closed','Expired','Unknown'));

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_review_status_check;
ALTER TABLE properties ADD CONSTRAINT properties_review_status_check
  CHECK (review_status IN ('New','Reviewed','Contacted','Dead'));

CREATE INDEX IF NOT EXISTS idx_properties_listing_status ON properties(listing_status);
CREATE INDEX IF NOT EXISTS idx_properties_review_status ON properties(review_status);

-- ============================================================
-- Section 2: analyses — Kelly 36-col parity + badge
-- ============================================================

ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS discount_pct numeric,
  ADD COLUMN IF NOT EXISTS total_in numeric,
  ADD COLUMN IF NOT EXISTS gross_profit numeric,
  ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS badge text,
  ADD COLUMN IF NOT EXISTS comp_per_sqft numeric[];

ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_badge_check;
ALTER TABLE analyses ADD CONSTRAINT analyses_badge_check
  CHECK (badge IS NULL OR badge IN ('Perfect Fit','Strong Match','Could Work','Needs a Reason','Pass'));

CREATE INDEX IF NOT EXISTS idx_analyses_badge ON analyses(badge);
CREATE INDEX IF NOT EXISTS idx_analyses_verified ON analyses(verified);

-- ============================================================
-- Section 3: lead_sources — source registry
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_sources (
  slug text PRIMARY KEY,
  display_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('listings','enrichment','skip_trace')),
  enabled boolean DEFAULT false,
  config jsonb DEFAULT '{}'::jsonb,
  env_key_names text[],
  docs_url text,
  notes text,
  last_sync_at timestamptz,
  last_sync_status text CHECK (last_sync_status IS NULL OR last_sync_status IN ('success','partial','failed','needs_config','never_run')),
  last_sync_count int,
  last_sync_duration_ms int,
  last_error text,
  total_synced_count int DEFAULT 0,
  total_errors_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_source_syncs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_slug text NOT NULL REFERENCES lead_sources(slug) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','failed')),
  count int DEFAULT 0,
  duration_ms int,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_source_syncs_slug ON lead_source_syncs(source_slug);
CREATE INDEX IF NOT EXISTS idx_source_syncs_started ON lead_source_syncs(started_at DESC);

-- updated_at trigger
DROP TRIGGER IF EXISTS lead_sources_updated_at ON lead_sources;
CREATE TRIGGER lead_sources_updated_at
  BEFORE UPDATE ON lead_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Section 4: Seed the known sources
-- ============================================================

INSERT INTO lead_sources (slug, display_name, kind, env_key_names, docs_url, notes, last_sync_status) VALUES
  ('rentcast', 'Rentcast', 'listings',
    ARRAY['RENTCAST_API_KEY'],
    'https://developers.rentcast.io',
    'Primary active-listings source for Austin metro. MLS aggregated, comps included. FSBO inferred from null mlsName.',
    'never_run'),
  ('realtor_rapidapi', 'Realtor.com (RapidAPI)', 'listings',
    ARRAY['RAPIDAPI_KEY'],
    'https://rapidapi.com/Champlion/api/realtor-com4',
    'Secondary active-listings source. Cross-validation and dedupe signal against Rentcast.',
    'never_run'),
  ('craigslist_austin', 'Craigslist Austin FSBO', 'listings',
    ARRAY[]::text[],
    'https://austin.craigslist.org/search/reo',
    'Tertiary FSBO source. Rate-limited 1 req / 2s with jitter. Internal use only per ToS risk. Rows tagged licensing=scraped_tos_risk.',
    'never_run'),
  ('attom', 'ATTOM Data', 'enrichment',
    ARRAY['ATTOM_API_KEY'],
    'https://api.developer.attomdata.com',
    'Tax assessed value, equity position, permit history.',
    'never_run'),
  ('batchdata', 'BatchData', 'skip_trace',
    ARRAY['BATCHDATA_API_KEY'],
    'https://docs.batchdata.com',
    'Skip trace (owner phone/email), distress signals, absentee flag.',
    'never_run'),
  ('estated', 'Estated', 'enrichment',
    ARRAY['ESTATED_API_KEY'],
    'https://estated.com/developers',
    'Property detail backfill.',
    'never_run')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  kind = EXCLUDED.kind,
  env_key_names = EXCLUDED.env_key_names,
  docs_url = EXCLUDED.docs_url,
  notes = EXCLUDED.notes,
  updated_at = now();

-- ============================================================
-- Section 5: RLS on new tables
-- ============================================================

ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_source_syncs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access" ON lead_sources;
CREATE POLICY "Authenticated users full access" ON lead_sources
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON lead_sources;
CREATE POLICY "Service role full access" ON lead_sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access" ON lead_source_syncs;
CREATE POLICY "Authenticated users full access" ON lead_source_syncs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON lead_source_syncs;
CREATE POLICY "Service role full access" ON lead_source_syncs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Section 6: Realtime on source monitor tables
-- ============================================================
-- Enables live status updates in /dashboard/sources without polling.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lead_sources'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lead_sources;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lead_source_syncs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lead_source_syncs;
  END IF;
END $$;
