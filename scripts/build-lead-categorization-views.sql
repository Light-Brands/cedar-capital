-- Lead categorization views — Cedar Capital
-- 2026-04-30 (built from the 404-property ATTOM enrichment we landed
-- before hitting the trial cap)
--
-- Each view surfaces a distinct wholesale-archetype lead pattern. The patterns
-- are derived from ATTOM owner + mortgage data, cross-referenced against ARV.
-- Drop a UI page on top of any of these and you have an outreach list.

-- ============================================================
-- reo_leads: Bank/Fannie/Freddie/Trust REO + their mortgage history
-- ============================================================
CREATE OR REPLACE VIEW reo_leads AS
SELECT
  p.id,
  p.address,
  p.zip_code,
  p.attom_owner_name AS owner,
  CASE
    WHEN attom_owner_name ~* 'FANNIE|FEDERAL NATIONAL' THEN 'Fannie Mae REO'
    WHEN attom_owner_name ~* 'FREDDIE|FEDERAL HOME LOAN' THEN 'Freddie Mac REO'
    WHEN attom_owner_name ~* 'VETERANS' THEN 'VA REO'
    WHEN attom_owner_name ~* 'BANK' AND attom_owner_name !~* 'BANKHEAD|EMBARK' THEN 'Bank REO'
    WHEN attom_owner_name ~* 'MORTGAGE TRUST|MORTGAGE ASSET' THEN 'Mortgage Trust REO'
    WHEN attom_owner_name ~* 'REVERSE' THEN 'Reverse Mortgage Co.'
    WHEN attom_owner_name ~* 'MIDFIRST|FREEDOM|NATIONSTAR|CARRINGTON|WELLS FARGO' THEN 'Servicer-held REO'
    ELSE 'Other Institutional'
  END AS reo_class,
  p.asking_price,
  p.arv_mid,
  CASE WHEN p.asking_price > 0 AND p.arv_mid > 0
    THEN ROUND(((p.arv_mid - p.asking_price) / p.asking_price * 100)::numeric, 0) END AS upside_pct,
  p.attom_mortgage_amount AS prior_loan,
  p.attom_mortgage_lender AS prior_lender,
  p.attom_absentee_ind AS absentee
FROM properties p
WHERE p.attom_owner_name ~* '(FANNIE|FREDDIE|VETERANS|FEDERAL NATIONAL|FEDERAL HOME LOAN|MORTGAGE TRUST|MORTGAGE ASSET|REVERSE|BANK|MIDFIRST|FREEDOM|NATIONSTAR|CARRINGTON|WELLS FARGO|CITIBANK|TRUIST|FIRST UNITED|SEATTLE|NORTHPOINTE)'
  AND p.attom_owner_name !~* 'BANKHEAD|EMBARK|RIVERBANK'
  AND p.zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
ORDER BY upside_pct DESC NULLS LAST;

-- ============================================================
-- short_sale_leads: asking < mortgage balance = bank willing to take a loss
-- ============================================================
CREATE OR REPLACE VIEW short_sale_leads AS
SELECT
  p.id,
  p.address,
  p.zip_code,
  p.attom_owner_name AS owner,
  p.asking_price,
  p.attom_mortgage_amount AS mortgage,
  p.arv_mid,
  ROUND(((p.attom_mortgage_amount - p.asking_price) / p.asking_price * 100)::numeric, 0) AS underwater_pct,
  p.attom_mortgage_lender AS lender,
  p.attom_absentee_ind AS absentee
FROM properties p
WHERE p.asking_price > 0
  AND p.attom_mortgage_amount > p.asking_price * 1.10
  AND p.attom_mortgage_amount > 100000
  AND p.zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
ORDER BY underwater_pct DESC;

-- ============================================================
-- equity_rich_leads: 15+yr-old mortgages with significant ARV upside
-- Owner has paid off most/all principal — flexible on price for cashout
-- ============================================================
CREATE OR REPLACE VIEW equity_rich_leads AS
SELECT
  p.id,
  p.address,
  p.zip_code,
  p.attom_owner_name AS owner,
  EXTRACT(YEAR FROM age(p.attom_mortgage_origination_date))::int AS mortgage_age,
  p.attom_mortgage_lender AS lender,
  p.attom_mortgage_amount AS original_loan,
  p.asking_price,
  p.arv_mid,
  ROUND(((p.arv_mid - p.asking_price) / p.asking_price * 100)::numeric, 0) AS upside_pct,
  p.attom_absentee_ind AS absentee
FROM properties p
WHERE p.attom_mortgage_origination_date IS NOT NULL
  AND p.attom_mortgage_origination_date < CURRENT_DATE - interval '15 years'
  AND p.asking_price > 0 AND p.arv_mid > p.asking_price * 1.10
  AND p.zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
ORDER BY mortgage_age DESC;

-- ============================================================
-- multi_property_owners: outreach efficiency — one conversation, many deals
-- ============================================================
CREATE OR REPLACE VIEW multi_property_owners AS
SELECT
  attom_owner_name AS owner,
  COUNT(*) AS holdings,
  ROUND(AVG(asking_price)) AS avg_asking,
  ROUND(SUM(arv_mid)) AS total_arv,
  ROUND(AVG(CASE WHEN asking_price > 0 AND arv_mid > 0
    THEN (arv_mid - asking_price) / asking_price * 100 END)::numeric, 0) AS avg_upside_pct,
  ARRAY_AGG(LEFT(address, 30) ORDER BY arv_mid DESC NULLS LAST) AS sample_addresses
FROM properties
WHERE attom_owner_name IS NOT NULL
  AND zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
GROUP BY attom_owner_name
HAVING COUNT(*) >= 2
ORDER BY total_arv DESC NULLS LAST;

-- ============================================================
-- free_and_clear_leads: no mortgage of record + ARV well above asking
-- Cleanest deals — no lien-payoff math, owner can move fast
-- ============================================================
CREATE OR REPLACE VIEW free_and_clear_leads AS
SELECT
  p.id,
  p.address,
  p.zip_code,
  p.attom_owner_name AS owner,
  p.attom_owner_type AS owner_type,
  p.asking_price,
  p.arv_mid,
  ROUND(((p.arv_mid - p.asking_price) / p.asking_price * 100)::numeric, 0) AS upside_pct,
  p.attom_absentee_ind AS absentee,
  p.attom_condition AS condition
FROM properties p
WHERE (p.attom_mortgage_amount = 0 OR p.attom_mortgage_amount IS NULL)
  AND p.attom_owner_name IS NOT NULL
  AND p.asking_price > 0
  AND p.arv_mid > p.asking_price * 1.20
  AND p.zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
ORDER BY (p.arv_mid - p.asking_price) DESC;

-- ============================================================
-- corporate_owner_leads: LLCs, Inc., Trusts (non-REO) — investor-to-investor
-- ============================================================
CREATE OR REPLACE VIEW corporate_owner_leads AS
SELECT
  p.id,
  p.address,
  p.zip_code,
  p.attom_owner_name AS owner,
  CASE
    WHEN attom_owner_name ~* 'LLC' THEN 'LLC'
    WHEN attom_owner_name ~* 'INC$|INCORPORATED' THEN 'Inc.'
    WHEN attom_owner_name ~* 'CORP$|CORPORATION' THEN 'Corp.'
    WHEN attom_owner_name ~* 'TRUST' THEN 'Trust'
    WHEN attom_owner_name ~* 'PARTNERSHIP|LP$|LLP' THEN 'Partnership'
    ELSE 'Entity'
  END AS entity_type,
  p.asking_price,
  p.arv_mid,
  ROUND(((p.arv_mid - p.asking_price) / p.asking_price * 100)::numeric, 0) AS upside_pct,
  p.attom_mortgage_amount AS mortgage,
  p.attom_absentee_ind AS absentee
FROM properties p
WHERE p.attom_owner_name ~* 'LLC|INC$|CORP|TRUST|LP$|LLP'
  AND p.attom_owner_name !~* 'FANNIE|FREDDIE|VETERANS|MORTGAGE TRUST|MORTGAGE ASSET|REVERSE'
  AND p.attom_owner_name !~* 'BANK ' AND p.attom_owner_name !~* '^.*BANK$'
  AND p.zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
  AND p.asking_price > 0 AND p.arv_mid > 0
ORDER BY p.arv_mid DESC NULLS LAST;
