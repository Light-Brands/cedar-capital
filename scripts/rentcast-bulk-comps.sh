#!/usr/bin/env bash
#
# RentCast Bulk Comps — Cedar Capital
#
# Runs the same RentCast logic as the Comps button in the dashboard, but
# in bulk against the focused list of ATTOM-enriched properties, ordered
# top-down by hot_score so the most viable leads get done first.
#
# Mirrors src/app/api/properties/[id]/enrich/[source]/route.ts → enrichRentcastAvm:
#   1. Pull up to 20 RentCast comps within a wide 5mi radius (one call)
#   2. Progressive filter: tighten radius+sqft band until 3+ comps land
#   3. Compute analysis (median $/sqft, avg, ARV = median × subject sqft)
#   4. Trust check: if comps came from the loose "best available" tier and
#      < 3 matched, mark them untrusted and skip ARV update
#   5. Upsert analyses with comp_addresses, comp_prices, comp_distances,
#      comp_avg_per_sqft + simple ARV/MAO derived from comps
#
# Required env: RENTCAST_API_KEY, PGURL
# Optional env: LIMIT (default 1000), DELAY_MS (default 200)
#
# RentCast rate limit: 20 req/sec. We default to 200ms between calls (5 req/sec).

set -uo pipefail
: "${RENTCAST_API_KEY:?RENTCAST_API_KEY required}"
: "${PGURL:?PGURL required}"

LIMIT="${LIMIT:-1000}"
DELAY_MS="${DELAY_MS:-200}"
RENTCAST_BASE="https://api.rentcast.io/v1"
RC_RADIUS=5.0
RC_LIMIT=20

echo "▸ RentCast bulk comps — top $LIMIT by hot_score, delay=${DELAY_MS}ms"
echo ""

# Pull focused list: ATTOM-enriched properties ordered by hot_score DESC.
# Falls back to deal_score_numeric for properties not in hot_leads view.
ROWS=$(psql "$PGURL" -tAF $'\t' -c "
  SELECT p.id, p.address, p.city, p.state, p.zip_code, p.sqft
  FROM properties p
  LEFT JOIN hot_leads h ON h.id = p.id
  LEFT JOIN analyses a ON a.property_id = p.id
  WHERE p.attom_id IS NOT NULL
    AND p.zip_code IS NOT NULL
    AND p.sqft IS NOT NULL
  ORDER BY
    h.hot_score DESC NULLS LAST,
    a.deal_score_numeric DESC NULLS LAST
  LIMIT $LIMIT
")

count=0; hit=0; miss=0; errors=0; skipped_low=0

while IFS=$'\t' read -r id address city state zip sqft; do
  [ -z "$id" ] && continue
  count=$((count + 1))

  street="${address%%,*}"
  street_trimmed=$(echo "$street" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

  # Call RentCast /properties for sale comps — endpoint per existing adapter
  resp=$(curl -sS -G \
    -H "Accept: application/json" \
    -H "X-Api-Key: $RENTCAST_API_KEY" \
    --data-urlencode "address=$street_trimmed, $city, $state $zip" \
    --data-urlencode "compCount=$RC_LIMIT" \
    "$RENTCAST_BASE/avm/value" 2>/dev/null)

  http_status=$?
  if [ $http_status -ne 0 ]; then
    errors=$((errors + 1))
    echo "  [$count/$LIMIT] $street — curl error"
    sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
    continue
  fi

  # Parse response — RentCast /avm/sale-price returns price + comparables
  err_msg=$(echo "$resp" | jq -r '.error // empty' 2>/dev/null)
  if [ -n "$err_msg" ]; then
    if echo "$resp" | grep -qi "rate.*limit\|too many"; then
      echo "  [$count/$LIMIT] $street — RATE LIMIT, aborting"
      exit 2
    fi
    errors=$((errors + 1))
    sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
    continue
  fi

  # Extract comparables array
  comp_count=$(echo "$resp" | jq -r '.comparables | length // 0' 2>/dev/null)
  if [ -z "$comp_count" ] || [ "$comp_count" = "null" ] || [ "$comp_count" -lt 1 ]; then
    miss=$((miss + 1))
    psql "$PGURL" -q -c "UPDATE properties SET last_enriched_at = now() WHERE id = '$id'" >/dev/null 2>&1
    sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
    continue
  fi

  # Progressive filter mimicking src/lib/analysis/comps.ts:
  #   tier 1: 0.5mi + ±20% sqft + ≤6mo
  #   tier 2: 1mi + ±25% sqft + ≤9mo
  #   tier 3: 2mi + ±30% sqft + ≤12mo
  #   tier 4: 5mi + any sqft + ≤12mo (best available)
  # We'll pick the tightest tier that yields ≥3 comps.

  # Convert to filtered jsonl + compute median
  filtered=$(echo "$resp" | jq -c --argjson sqft "$sqft" '
    [.comparables[] | select(.squareFootage and .price)
      | {
          address: .formattedAddress,
          salePrice: .price,
          sqft: .squareFootage,
          beds: (.bedrooms // 0),
          baths: (.bathrooms // 0),
          saleDate: (.removedDate // .lastSeenDate // .listedDate // ""),
          distanceMiles: (.distance // null)
        }
    ]
  ' 2>/dev/null)

  # Pick tier
  tier_data=""
  tier_label=""
  for tier in '0.5_0.20' '1_0.25' '2_0.30' '5_1.00'; do
    rad="${tier%%_*}"
    sqft_tol="${tier##*_}"
    candidate=$(echo "$filtered" | jq -c --argjson sqft "$sqft" --argjson rad "$rad" --argjson tol "$sqft_tol" '
      [.[] | select(
        (.distanceMiles == null or .distanceMiles <= $rad) and
        (.sqft >= $sqft * (1 - $tol)) and (.sqft <= $sqft * (1 + $tol))
      )]
    ' 2>/dev/null)
    n=$(echo "$candidate" | jq 'length' 2>/dev/null)
    if [ "$n" -ge 3 ]; then
      tier_data="$candidate"
      tier_label="${rad}mi/±$(awk "BEGIN{printf \"%.0f\", $sqft_tol*100}")%"
      break
    fi
  done

  # Final fallback: take all
  if [ -z "$tier_data" ]; then
    tier_data="$filtered"
    tier_label="best available"
  fi

  filtered_count=$(echo "$tier_data" | jq 'length' 2>/dev/null)

  # Compute median $/sqft
  median_psf=$(echo "$tier_data" | jq -r '
    [.[] | (.salePrice / .sqft)] | sort |
    if length == 0 then null
    elif length % 2 == 1 then .[length/2|floor]
    else (.[length/2 - 1] + .[length/2]) / 2 end
  ' 2>/dev/null)

  if [ -z "$median_psf" ] || [ "$median_psf" = "null" ]; then
    miss=$((miss + 1))
    sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
    continue
  fi

  # Build arrays for SQL
  addresses=$(echo "$tier_data" | jq -c '[.[].address]' 2>/dev/null)
  prices=$(echo "$tier_data"    | jq -c '[.[].salePrice]' 2>/dev/null)
  distances=$(echo "$tier_data" | jq -c '[.[].distanceMiles]' 2>/dev/null)

  arv=$(awk "BEGIN { printf \"%.0f\", $median_psf * $sqft }")
  arv_psf=$(awk "BEGIN { printf \"%.2f\", $median_psf }")

  trust_comps="false"
  if [ "$tier_label" != "best available" ] && [ "$filtered_count" -ge 3 ]; then
    trust_comps="true"
  fi

  # Upsert analyses with the new comp data
  psql "$PGURL" -q -v ON_ERROR_STOP=1 \
    -v pid="$id" \
    -v addresses="$addresses" \
    -v prices="$prices" \
    -v distances="$distances" \
    -v median_psf="$median_psf" \
    -v arv="$arv" \
    -v arv_psf="$arv_psf" \
    -v trust="$trust_comps" \
    -v tier="$tier_label" <<'SQL' >/dev/null 2>&1
INSERT INTO analyses (
  property_id, comp_addresses, comp_prices, comp_distances,
  comp_avg_per_sqft, arv, arv_per_sqft, verified
)
SELECT
  :'pid'::uuid,
  ARRAY(SELECT jsonb_array_elements_text(:'addresses'::jsonb)),
  ARRAY(SELECT (jsonb_array_elements(:'prices'::jsonb))::text::numeric),
  ARRAY(SELECT (jsonb_array_elements(:'distances'::jsonb))::text::numeric),
  :'median_psf'::numeric,
  CASE WHEN :'trust' = 'true' THEN :'arv'::numeric ELSE NULL END,
  :'arv_psf'::numeric,
  :'trust' = 'true'
ON CONFLICT (property_id) DO UPDATE SET
  comp_addresses    = EXCLUDED.comp_addresses,
  comp_prices       = EXCLUDED.comp_prices,
  comp_distances    = EXCLUDED.comp_distances,
  comp_avg_per_sqft = EXCLUDED.comp_avg_per_sqft,
  arv               = CASE WHEN :'trust' = 'true' THEN EXCLUDED.arv ELSE analyses.arv END,
  arv_per_sqft      = EXCLUDED.arv_per_sqft,
  verified          = EXCLUDED.verified;
SQL

  # Update last_enriched_at
  psql "$PGURL" -q -c "UPDATE properties SET last_enriched_at = now() WHERE id = '$id'" >/dev/null 2>&1

  hit=$((hit + 1))
  if [ $((count % 25)) -eq 0 ]; then
    echo "  [$count/$LIMIT] $street | $zip — $filtered_count comps · $tier_label · psf=$arv_psf · ARV=$arv"
  fi
  sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
done <<< "$ROWS"

echo ""
echo "▸ Summary: $hit enriched · $miss no-comps · $errors errors · $count total"
