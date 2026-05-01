#!/usr/bin/env bash
#
# Comprehensive ATTOM backfill — Cedar Capital
#
# Hits /property/detailmortgageowner for every Austin property without
# attom_id, capturing detail + AVM + mortgage + owner in a single call.
# Replaces the two-call detail+homeequity pattern.
#
# Required env: ATTOM_API_KEY, PGURL
# Optional env: LIMIT (default 200), DELAY_MS (default 250), TIER (default ALL)

set -uo pipefail
: "${ATTOM_API_KEY:?ATTOM_API_KEY required}"
: "${PGURL:?PGURL required}"

LIMIT="${LIMIT:-200}"
DELAY_MS="${DELAY_MS:-250}"
TIER="${TIER:-ALL}"
ATTOM_BASE="https://api.gateway.attomdata.com/propertyapi/v1.0.0"

case "$TIER" in
  ALL)         WHERE="TRUE" ;;
  ACTIVE)      WHERE="listing_status = 'Active'" ;;
  HIGH_VALUE)  WHERE="asking_price > 250000 AND asking_price < 1500000" ;;
  *) echo "unknown TIER: $TIER" >&2; exit 1 ;;
esac

echo "▸ Comprehensive ATTOM backfill — tier=$TIER limit=$LIMIT delay=${DELAY_MS}ms"

ROWS=$(psql "$PGURL" -tAF $'\t' -c "
  SELECT id, address, zip_code
  FROM properties
  WHERE zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
    AND (attom_id IS NULL OR attom_owner_name IS NULL)
    AND ($WHERE)
  ORDER BY
    -- distressed + high-equity first, then everything else
    ('distressed' = ANY(description_categories)) DESC,
    ('multi_unit' = ANY(description_categories)) DESC,
    listing_status = 'Active' DESC,
    created_at DESC
  LIMIT $LIMIT
")

count=0; hit=0; miss=0; errors=0

while IFS=$'\t' read -r id address zip; do
  [ -z "$id" ] && continue
  count=$((count + 1))

  street="${address%%,*}"
  start=$(date +%s%N 2>/dev/null || date +%s)
  resp=$(curl -sS -G \
    -H "Accept: application/json" \
    -H "apikey: $ATTOM_API_KEY" \
    --data-urlencode "address1=$street" \
    --data-urlencode "address2=$zip" \
    "$ATTOM_BASE/property/detailmortgageowner" 2>/dev/null)
  end=$(date +%s%N 2>/dev/null || date +%s)
  bytes=${#resp}

  # Log call (best-effort)
  psql "$PGURL" -q -c "INSERT INTO attom_call_log(endpoint, status_code, bytes, property_id, notes) VALUES('/property/detailmortgageowner', 200, $bytes, '$id', 'comprehensive backfill');" >/dev/null 2>&1 || true

  # Rate-limit guard: bail early on 401 to avoid burning more attempts
  if echo "$resp" | jq -e '.Response.status.code == "401" or .Response.status.msg == "Unauthorized"' >/dev/null 2>&1; then
    echo "  [$count/$LIMIT] $street — 401 RATE LIMIT HIT, aborting"
    echo ""
    echo "▸ ABORTED on rate limit at $count rows. ATTOM cap hit. Try again after reset."
    exit 2
  fi
  if echo "$resp" | jq -e '.Response.status.code == "404"' >/dev/null 2>&1; then
    echo "  [$count/$LIMIT] $street — endpoint 404"
    errors=$((errors + 1))
    sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
    continue
  fi

  attom_id=$(echo "$resp" | jq -r '.property[0].identifier.attomId // empty' 2>/dev/null)
  if [ -z "$attom_id" ]; then
    miss=$((miss + 1))
    psql "$PGURL" -q -c "UPDATE properties SET last_enriched_at = now() WHERE id = '$id'" >/dev/null
    sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
    continue
  fi

  # Extract everything
  detail_json=$(echo "$resp" | jq -c '.property[0] // null')
  avm_value=$(echo  "$resp" | jq -r '.property[0].avm.amount.value // "NULL"')
  avm_low=$(echo    "$resp" | jq -r '.property[0].avm.amount.low // "NULL"')
  avm_high=$(echo   "$resp" | jq -r '.property[0].avm.amount.high // "NULL"')
  avm_score=$(echo  "$resp" | jq -r '.property[0].avm.amount.scr // "NULL"')

  # Owner data — /property/detailmortgageowner uses lowercase keys
  # (verified 2026-04-30 against actual API response shape)
  owner_name=$(echo "$resp" | jq -r '
    .property[0].owner.owner1 // {} |
    (.fullname // ((.firstnameandmi // "") + " " + (.lastname // "")))
    | gsub("^\\s+|\\s+$"; "")
  ' 2>/dev/null)
  owner_mailing=$(echo "$resp" | jq -r '.property[0].owner.mailingaddressoneline // ""' 2>/dev/null)
  owner_type=$(echo "$resp" | jq -r '.property[0].owner.ownerrelationshiptype // ""' 2>/dev/null)
  # absenteeownerstatus is "O" for owner-occupied, "A" for absentee
  absentee_raw=$(echo "$resp" | jq -r '.property[0].owner.absenteeownerstatus // ""' 2>/dev/null)
  case "$absentee_raw" in
    "O") absentee_ind="OWNER OCCUPIED" ;;
    "A") absentee_ind="ABSENTEE" ;;
    *)   absentee_ind="" ;;
  esac

  # Mortgage data — top-level under .property[0].mortgage (not .FirstConcurrent)
  mortgage_lender=$(echo "$resp" | jq -r '.property[0].mortgage.lender.lastname // .property[0].mortgage.lender.companyname // ""' 2>/dev/null)
  mortgage_date=$(echo "$resp"   | jq -r '.property[0].mortgage.date // ""' 2>/dev/null)
  mortgage_amount=$(echo "$resp" | jq -r '.property[0].mortgage.amount // "NULL"' 2>/dev/null)

  # Building details (lowercase shape consistent with detailmortgageowner)
  condition=$(echo "$resp" | jq -r '.property[0].building.construction.condition // ""')
  quality=$(echo   "$resp" | jq -r '.property[0].building.summary.quality // ""')
  ybe=$(echo       "$resp" | jq -r '.property[0].building.summary.yearbuilteffective // "NULL"')

  # AVM may live under .avm or be missing entirely on the combo endpoint;
  # earlier code already extracts these. If .avm.amount.value is missing,
  # the property simply has no AVM in this combo response.
  if [ "$avm_value" = "" ] || [ "$avm_value" = "null" ]; then avm_value="NULL"; fi
  if [ "$avm_low" = "" ] || [ "$avm_low" = "null" ]; then avm_low="NULL"; fi
  if [ "$avm_high" = "" ] || [ "$avm_high" = "null" ]; then avm_high="NULL"; fi
  if [ "$avm_score" = "" ] || [ "$avm_score" = "null" ]; then avm_score="NULL"; fi

  # Home equity follow-up is optional — costs an extra call per property.
  # Default OFF for bulk runs; set FETCH_HOMEEQUITY=1 to enable.
  ltv="NULL"; lendable="NULL"; loanbal="NULL"; avm_json='null'
  if [ "${FETCH_HOMEEQUITY:-0}" = "1" ] && [ "$avm_value" != "NULL" ] && [ "$avm_value" != "0" ]; then
    he_resp=$(curl -sS -G \
      -H "Accept: application/json" \
      -H "apikey: $ATTOM_API_KEY" \
      --data-urlencode "address1=$street" \
      --data-urlencode "address2=$zip" \
      "$ATTOM_BASE/valuation/homeequity" 2>/dev/null)
    he_bytes=${#he_resp}
    psql "$PGURL" -q -c "INSERT INTO attom_call_log(endpoint, status_code, bytes, property_id, notes) VALUES('/valuation/homeequity', 200, $he_bytes, '$id', 'comprehensive backfill');" >/dev/null 2>&1 || true

    ltv=$(echo "$he_resp"      | jq -r '.property[0].homeEquity.LTV // "NULL"')
    lendable=$(echo "$he_resp" | jq -r '.property[0].homeEquity.estimatedLendableEquity // "NULL"')
    loanbal=$(echo "$he_resp"  | jq -r '.property[0].homeEquity.totalEstimatedLoanBalance // "NULL"')
    avm_json=$(echo "$he_resp" | jq -c '.property[0] // null')
  fi

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
    -v absentee="$absentee_ind" \
    -v owner_name="$owner_name" \
    -v owner_mailing="$owner_mailing" \
    -v owner_type="$owner_type" \
    -v mortgage_lender="$mortgage_lender" \
    -v mortgage_date="$mortgage_date" \
    -v mortgage_amount="$mortgage_amount" \
    -v pid="$id" \
    -v detail_json="$detail_json" \
    -v avm_json="$avm_json" <<'SQL' >/dev/null
UPDATE properties SET
  attom_id              = :'attom_id',
  attom_data            = :'detail_json'::jsonb,
  attom_avm             = NULLIF(:'avm_json','null')::jsonb,
  attom_avm_value       = NULLIF(:'avm_value','NULL')::numeric,
  attom_avm_low         = NULLIF(:'avm_low','NULL')::numeric,
  attom_avm_high        = NULLIF(:'avm_high','NULL')::numeric,
  attom_avm_score       = NULLIF(:'avm_score','NULL')::int,
  attom_ltv             = COALESCE(NULLIF(:'ltv','NULL')::numeric, properties.attom_ltv),
  attom_lendable_equity = COALESCE(NULLIF(:'lendable','NULL')::numeric, properties.attom_lendable_equity),
  attom_total_loan_balance = COALESCE(NULLIF(:'loanbal','NULL')::numeric, properties.attom_total_loan_balance),
  attom_condition       = NULLIF(:'condition',''),
  attom_quality         = NULLIF(:'quality',''),
  attom_year_built_effective = NULLIF(:'ybe','NULL')::int,
  attom_absentee_ind    = NULLIF(:'absentee',''),
  attom_owner_name      = NULLIF(:'owner_name',''),
  attom_owner_mailing   = NULLIF(:'owner_mailing',''),
  attom_owner_type      = NULLIF(:'owner_type',''),
  attom_mortgage_lender = NULLIF(:'mortgage_lender',''),
  attom_mortgage_origination_date = CASE WHEN COALESCE(:'mortgage_date','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN NULLIF(:'mortgage_date','')::date ELSE NULL END,
  attom_mortgage_amount = NULLIF(:'mortgage_amount','NULL')::numeric,
  attom_last_synced_at  = now(),
  last_enriched_at      = now()
WHERE id = :'pid';
SQL

  hit=$((hit + 1))
  if [ $((count % 50)) -eq 0 ]; then
    echo "  [$count/$LIMIT] $street — owner=$owner_name avm=$avm_value ltv=$ltv"
  fi
  sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
done <<< "$ROWS"

echo ""
echo "▸ Summary: $hit enriched · $miss no-match · $errors errors · $count total"
