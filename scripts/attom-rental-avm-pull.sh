#!/usr/bin/env bash
#
# ATTOM rental AVM pull — Cedar Capital
# Hits /valuation/rentalavm for multi-unit + active Austin properties.
# Persists monthly rent estimate + range to properties.attom_rental_*.

set -uo pipefail
: "${ATTOM_API_KEY:?ATTOM_API_KEY required}"
: "${PGURL:?PGURL required}"

LIMIT="${LIMIT:-400}"
DELAY_MS="${DELAY_MS:-250}"
ATTOM_BASE="https://api.gateway.attomdata.com/propertyapi/v1.0.0"

echo "▸ ATTOM rental AVM pull — multi-unit + active, limit=$LIMIT"

ROWS=$(psql "$PGURL" -tAF $'\t' -c "
  SELECT id, address, zip_code
  FROM properties
  WHERE zip_code IN (SELECT zip_code FROM austin_zip_codes WHERE is_active=true)
    AND attom_rental_avm IS NULL
    AND ('multi_unit' = ANY(description_categories) OR listing_status = 'Active')
  ORDER BY
    'multi_unit' = ANY(description_categories) DESC,
    created_at DESC
  LIMIT $LIMIT
")

count=0; hit=0; miss=0

while IFS=$'\t' read -r id address zip; do
  [ -z "$id" ] && continue
  count=$((count + 1))

  street="${address%%,*}"
  resp=$(curl -sS -G \
    -H "Accept: application/json" \
    -H "apikey: $ATTOM_API_KEY" \
    --data-urlencode "address1=$street" \
    --data-urlencode "address2=$zip" \
    "$ATTOM_BASE/valuation/rentalavm" 2>/dev/null)
  bytes=${#resp}

  psql "$PGURL" -q -c "INSERT INTO attom_call_log(endpoint, status_code, bytes, property_id, notes) VALUES('/valuation/rentalavm', 200, $bytes, '$id', 'rental avm pull');" >/dev/null 2>&1 || true

  # rentalavm endpoint returns fields under .rentalAvm (camelCase)
  rent_value=$(echo "$resp" | jq -r '.property[0].rentalAvm.estimatedRentalValue // "NULL"' 2>/dev/null)
  rent_low=$(echo   "$resp" | jq -r '.property[0].rentalAvm.estimatedMinRentalValue // "NULL"' 2>/dev/null)
  rent_high=$(echo  "$resp" | jq -r '.property[0].rentalAvm.estimatedMaxRentalValue // "NULL"' 2>/dev/null)

  if [ "$rent_value" = "NULL" ] || [ "$rent_value" = "0" ] || [ -z "$rent_value" ]; then
    miss=$((miss + 1))
    sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
    continue
  fi

  psql "$PGURL" -q -c "
    UPDATE properties SET
      attom_rental_avm = NULLIF('$rent_value','NULL')::numeric,
      attom_rental_low = NULLIF('$rent_low','NULL')::numeric,
      attom_rental_high = NULLIF('$rent_high','NULL')::numeric
    WHERE id = '$id';
  " >/dev/null

  hit=$((hit + 1))
  if [ $((count % 50)) -eq 0 ]; then
    echo "  [$count/$LIMIT] $street — rent=$rent_value/mo"
  fi
  sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
done <<< "$ROWS"

echo ""
echo "▸ Summary: $hit rentals · $miss no rental data · $count total"
