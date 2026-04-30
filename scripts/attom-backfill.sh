#!/usr/bin/env bash
#
# ATTOM bulk backfill — Cedar Capital
#
# Iterates a prioritized set of Austin properties, calls ATTOM /property/detail
# and /valuation/homeequity for each, persists raw payloads + extracted fields
# to the properties table.
#
# Required env:
#   ATTOM_API_KEY        — ATTOM Data API key
#   PGURL                — postgres://user:pass@host:port/db
#
# Optional env:
#   TIER                 — 'distressed' (default), 'multi_unit', 'active', 'all'
#   LIMIT                — max properties to process (default 50)
#   DELAY_MS             — sleep between calls (default 250)
#
# Usage:
#   ATTOM_API_KEY=... PGURL=postgresql://... bash scripts/attom-backfill.sh
#
# The script tracks attom_id on each row so re-runs skip already-enriched
# properties. Trial-budget-safe.

set -euo pipefail

: "${ATTOM_API_KEY:?ATTOM_API_KEY required}"
: "${PGURL:?PGURL required}"

TIER="${TIER:-distressed}"
LIMIT="${LIMIT:-50}"
DELAY_MS="${DELAY_MS:-250}"
ATTOM_BASE="https://api.gateway.attomdata.com/propertyapi/v1.0.0"

case "$TIER" in
  distressed)  WHERE="'distressed' = ANY(description_categories)" ;;
  multi_unit)  WHERE="'multi_unit' = ANY(description_categories)" ;;
  active)      WHERE="listing_status = 'Active'" ;;
  all)         WHERE="TRUE" ;;
  *) echo "unknown TIER: $TIER" >&2; exit 1 ;;
esac

echo "▸ ATTOM backfill — tier=$TIER limit=$LIMIT delay=${DELAY_MS}ms"

# Pull priority properties (zip-gated to Austin allowlist, no attom_id yet)
ROWS=$(psql "$PGURL" -tAF $'\t' -c "
  SELECT id, address, zip_code
  FROM properties
  WHERE zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
    AND attom_id IS NULL
    AND ($WHERE)
  ORDER BY
    -- distressed first within tier, then by listing recency
    ('distressed' = ANY(description_categories)) DESC,
    created_at DESC
  LIMIT $LIMIT
")

count=0
hit=0
miss=0
unentitled=0
errors=0

# Loop properties; ATTOM expects "{street}", "{zip}" (no full address)
while IFS=$'\t' read -r id address zip; do
  [ -z "$id" ] && continue
  count=$((count + 1))

  # ATTOM expects just the street portion, not full address with city/state
  street="${address%%,*}"

  # URL-encode (basic — addresses are ASCII letters/numbers/spaces/dots)
  street_enc=$(printf '%s' "$street" | jq -sRr @uri)
  zip_enc=$(printf '%s' "$zip" | jq -sRr @uri)

  # Hit /property/detail
  detail_resp=$(curl -sS -G \
    -H "Accept: application/json" \
    -H "apikey: $ATTOM_API_KEY" \
    --data-urlencode "address1=$street" \
    --data-urlencode "address2=$zip" \
    "$ATTOM_BASE/property/detail")

  # Hit /valuation/homeequity
  avm_resp=$(curl -sS -G \
    -H "Accept: application/json" \
    -H "apikey: $ATTOM_API_KEY" \
    --data-urlencode "address1=$street" \
    --data-urlencode "address2=$zip" \
    "$ATTOM_BASE/valuation/homeequity")

  # Detect unentitled (404 "No rule matched")
  if echo "$detail_resp" | jq -e '.Response.status.code == "404"' >/dev/null 2>&1; then
    unentitled=$((unentitled + 1))
    echo "  [$count/$LIMIT] $street | $zip — detail unentitled"
    sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
    continue
  fi

  # Extract attomId from whichever response has it
  attom_id=$(echo "$detail_resp" | jq -r '.property[0].identifier.attomId // empty' 2>/dev/null)
  if [ -z "$attom_id" ]; then
    attom_id=$(echo "$avm_resp" | jq -r '.property[0].identifier.attomId // empty' 2>/dev/null)
  fi

  if [ -z "$attom_id" ]; then
    miss=$((miss + 1))
    echo "  [$count/$LIMIT] $street | $zip — no match"
    psql "$PGURL" -q -c "UPDATE properties SET attom_last_synced_at = now(), last_enriched_at = now() WHERE id = '$id'" >/dev/null
    sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
    continue
  fi

  # Pull all extracted fields via jq
  avm_value=$(echo "$avm_resp" | jq -r '.property[0].avm.amount.value // "NULL"')
  avm_low=$(echo "$avm_resp"   | jq -r '.property[0].avm.amount.low // "NULL"')
  avm_high=$(echo "$avm_resp"  | jq -r '.property[0].avm.amount.high // "NULL"')
  avm_score=$(echo "$avm_resp" | jq -r '.property[0].avm.amount.scr // "NULL"')
  ltv=$(echo "$avm_resp"       | jq -r '.property[0].homeEquity.LTV // "NULL"')
  lendable=$(echo "$avm_resp"  | jq -r '.property[0].homeEquity.estimatedLendableEquity // "NULL"')
  loanbal=$(echo "$avm_resp"   | jq -r '.property[0].homeEquity.totalEstimatedLoanBalance // "NULL"')

  condition=$(echo "$detail_resp" | jq -r '.property[0].building.construction.condition // ""')
  quality=$(echo "$detail_resp"   | jq -r '.property[0].building.summary.quality // ""')
  ybe=$(echo "$detail_resp"       | jq -r '.property[0].building.summary.yearbuilteffective // "NULL"')
  absentee=$(echo "$detail_resp"  | jq -r '.property[0].summary.absenteeInd // ""')

  detail_json=$(echo "$detail_resp" | jq -c '.property[0] // null')
  avm_json=$(echo "$avm_resp"       | jq -c '.property[0] // null')

  psql "$PGURL" -q -v ON_ERROR_STOP=1 \
    -v attom_id="$attom_id" \
    -v avm_value="$avm_value" \
    -v avm_low="$avm_low" \
    -v avm_high="$avm_high" \
    -v avm_score="$avm_score" \
    -v ltv="$ltv" \
    -v lendable="$lendable" \
    -v loanbal="$loanbal" \
    -v ybe="$ybe" \
    -v condition="$condition" \
    -v quality="$quality" \
    -v absentee="$absentee" \
    -v pid="$id" \
    -v detail_json="$detail_json" \
    -v avm_json="$avm_json" <<'SQL'
UPDATE properties SET
  attom_id              = :'attom_id',
  attom_data            = :'detail_json'::jsonb,
  attom_avm             = :'avm_json'::jsonb,
  attom_avm_value       = NULLIF(:'avm_value','NULL')::numeric,
  attom_avm_low         = NULLIF(:'avm_low','NULL')::numeric,
  attom_avm_high        = NULLIF(:'avm_high','NULL')::numeric,
  attom_avm_score       = NULLIF(:'avm_score','NULL')::int,
  attom_ltv             = NULLIF(:'ltv','NULL')::numeric,
  attom_lendable_equity = NULLIF(:'lendable','NULL')::numeric,
  attom_total_loan_balance = NULLIF(:'loanbal','NULL')::numeric,
  attom_condition       = NULLIF(:'condition',''),
  attom_quality         = NULLIF(:'quality',''),
  attom_year_built_effective = NULLIF(:'ybe','NULL')::int,
  attom_absentee_ind    = NULLIF(:'absentee',''),
  attom_last_synced_at  = now(),
  last_enriched_at      = now()
WHERE id = :'pid';
SQL

  hit=$((hit + 1))
  echo "  [$count/$LIMIT] $street | $zip — attomId=$attom_id avm=$avm_value ltv=$ltv cond=$condition"
  sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
done <<< "$ROWS"

echo ""
echo "▸ Summary: $hit enriched · $miss no-match · $unentitled unentitled · $errors errors"
