-- Cedar Capital Speed-to-Lead Engine
-- Supabase Schema Migration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Core property record
-- ============================================================
CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  address text NOT NULL,
  city text DEFAULT 'Austin',
  state text DEFAULT 'TX',
  zip_code text,
  county text,
  lat numeric,
  lng numeric,
  beds int,
  baths int,
  sqft int,
  lot_size numeric,
  year_built int,
  property_type text,          -- SFR, Multi, Condo, Land
  list_type text,              -- Pre-foreclosure, Auction, REO, FSBO, MLS
  source text,                 -- Which API found it
  source_id text,              -- External ID for dedup
  asking_price numeric,
  zestimate numeric,
  tax_assessed_value numeric,
  last_sale_price numeric,
  last_sale_date date,
  days_on_market int,
  link text,
  photos text[],
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(address, zip_code)
);

-- ============================================================
-- Owner / lead info (from skip tracing)
-- ============================================================
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_name text,
  owner_type text,             -- Individual, LLC, Trust, Bank
  mailing_address text,
  phone_numbers text[],
  email_addresses text[],
  is_absentee boolean,
  is_owner_occupied boolean,
  ownership_length_years numeric,
  estimated_equity numeric,
  mortgage_balance numeric,
  skip_trace_data jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- Full deal analysis (mirrors spreadsheet)
-- ============================================================
CREATE TABLE analyses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  -- Offer Analysis
  offer_price numeric,
  offer_per_sqft numeric,
  arv numeric,
  arv_per_sqft numeric,
  diff numeric,
  -- Rehab Breakdown
  rehab_total numeric,
  rehab_kitchen numeric,
  rehab_bath numeric,
  rehab_interior_paint numeric,
  rehab_exterior_paint numeric,
  rehab_flooring numeric,
  rehab_windows numeric,
  rehab_misc numeric,
  rehab_roof numeric,
  rehab_sheetrock numeric,
  rehab_framing numeric,
  rehab_electrical numeric,
  rehab_plumbing numeric,
  rehab_hvac numeric,
  rehab_landscape numeric,
  rehab_foundation numeric,
  rehab_other numeric,
  -- Cost Analysis
  selling_costs numeric,
  total_cost numeric,
  -- Profit Analysis
  est_profit numeric,
  -- Finance Analysis
  ltv numeric DEFAULT 0.90,
  loan_amount numeric,
  points_pct numeric DEFAULT 0.02,
  interest_pct numeric DEFAULT 0.10,
  months_held int DEFAULT 6,
  monthly_payment numeric,
  total_interest numeric,
  total_points numeric,
  total_finance_cost numeric,
  profit_with_finance numeric,
  roi numeric,
  -- Wholesale Analysis
  mao numeric,
  wholesale_profit numeric,
  -- Scoring
  deal_score text,
  deal_score_numeric int,
  score_factors jsonb,
  -- Comp data
  comp_addresses text[],
  comp_prices numeric[],
  comp_avg_per_sqft numeric,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- Pipeline tracking
-- ============================================================
CREATE TABLE pipeline (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  analysis_id uuid REFERENCES analyses(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'new',
  notes text,
  assigned_to text,
  next_action text,
  next_action_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id)
);

-- ============================================================
-- Outreach log
-- ============================================================
CREATE TABLE outreach_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  channel text NOT NULL,       -- sms, email, call
  status text NOT NULL DEFAULT 'sent',
  template_used text,
  message_content text,
  sent_at timestamptz DEFAULT now(),
  response_text text,
  response_at timestamptz
);

-- ============================================================
-- Austin area zip codes
-- ============================================================
CREATE TABLE austin_zip_codes (
  zip_code text PRIMARY KEY,
  area_name text,
  is_active boolean DEFAULT true
);

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX idx_properties_zip ON properties(zip_code);
CREATE INDEX idx_properties_source ON properties(source, source_id);
CREATE INDEX idx_properties_created ON properties(created_at DESC);
CREATE INDEX idx_properties_asking ON properties(asking_price);
CREATE INDEX idx_leads_property ON leads(property_id);
CREATE INDEX idx_analyses_property ON analyses(property_id);
CREATE INDEX idx_analyses_score ON analyses(deal_score, deal_score_numeric DESC);
CREATE INDEX idx_pipeline_property ON pipeline(property_id);
CREATE INDEX idx_pipeline_stage ON pipeline(stage);
CREATE INDEX idx_outreach_lead ON outreach_log(lead_id);
CREATE INDEX idx_outreach_property ON outreach_log(property_id);
CREATE INDEX idx_outreach_status ON outreach_log(status);
CREATE INDEX idx_outreach_sent_at ON outreach_log(sent_at DESC);

-- ============================================================
-- Updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER pipeline_updated_at
  BEFORE UPDATE ON pipeline
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Seed Austin zip codes
-- ============================================================
INSERT INTO austin_zip_codes (zip_code, area_name) VALUES
  -- Central Austin
  ('78701', 'Downtown Austin'),
  ('78702', 'East Austin'),
  ('78703', 'Tarrytown / West Austin'),
  ('78704', 'South Austin / SoCo'),
  ('78705', 'West Campus / UT'),
  ('78712', 'UT Campus'),
  ('78722', 'Cherrywood / Mueller'),
  ('78723', 'Windsor Park / Mueller'),
  ('78724', 'East Austin / Del Valle'),
  ('78731', 'Northwest Hills'),
  ('78751', 'Hyde Park / North Loop'),
  ('78752', 'North Austin / Windsor Hills'),
  ('78753', 'North Austin / Rundberg'),
  ('78754', 'North Austin / Dessau'),
  ('78756', 'Brentwood / Crestview'),
  ('78757', 'Allandale'),
  ('78758', 'North Austin / Metric'),
  ('78759', 'Great Hills / Arboretum'),
  -- East Austin
  ('78721', 'East Austin / Govalle'),
  ('78725', 'East Austin / Montopolis'),
  ('78741', 'South East Austin / Riverside'),
  ('78742', 'East Austin / Del Valle'),
  ('78744', 'South East Austin'),
  ('78745', 'South Austin / Southpark Meadows'),
  -- South Austin
  ('78735', 'Barton Creek / Circle C'),
  ('78739', 'Circle C / Shady Hollow'),
  ('78747', 'South Austin / Slaughter'),
  ('78748', 'South Austin / Shady Hollow'),
  ('78749', 'Southwest Austin / Oak Hill'),
  ('78746', 'Westlake Hills / Eanes'),
  -- North Austin
  ('78727', 'North Austin / Scofield'),
  ('78729', 'Anderson Mill / McNeil'),
  ('78750', 'Jollyville / Canyon Creek'),
  -- Round Rock
  ('78664', 'Round Rock'),
  ('78665', 'Round Rock'),
  ('78680', 'Round Rock'),
  ('78681', 'Round Rock'),
  -- Cedar Park / Leander
  ('78613', 'Cedar Park'),
  ('78641', 'Leander'),
  ('78717', 'Brushy Creek'),
  ('78726', 'Cedar Park / Brushy Creek'),
  -- Georgetown
  ('78626', 'Georgetown'),
  ('78627', 'Georgetown'),
  ('78628', 'Georgetown'),
  ('78633', 'Georgetown / Sun City'),
  -- Pflugerville
  ('78660', 'Pflugerville'),
  ('78691', 'Pflugerville'),
  -- Buda / Kyle
  ('78610', 'Buda'),
  ('78640', 'Kyle'),
  -- Manor / Elgin
  ('78653', 'Manor'),
  ('78621', 'Elgin'),
  -- Bastrop
  ('78602', 'Bastrop'),
  ('78612', 'Cedar Creek'),
  -- Dripping Springs
  ('78620', 'Dripping Springs'),
  ('78737', 'Dripping Springs / Belterra'),
  ('78738', 'Bee Cave / Lakeway'),
  -- Lakeway / Bee Cave
  ('78734', 'Lakeway'),
  ('78736', 'Bee Cave')
ON CONFLICT (zip_code) DO NOTHING;

-- ============================================================
-- Enable Row Level Security (RLS)
-- ============================================================
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE austin_zip_codes ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Authenticated users full access" ON properties FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON analyses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON pipeline FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON outreach_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access" ON austin_zip_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow service role (for cron jobs) full access
CREATE POLICY "Service role full access" ON properties FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON leads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON analyses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON pipeline FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON outreach_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON austin_zip_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon read on zip codes (public reference data)
CREATE POLICY "Anon read zip codes" ON austin_zip_codes FOR SELECT TO anon USING (true);

-- ============================================================
-- Enable Realtime on key tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE properties;
ALTER PUBLICATION supabase_realtime ADD TABLE analyses;
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline;
ALTER PUBLICATION supabase_realtime ADD TABLE outreach_log;
