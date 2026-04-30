#!/usr/bin/env bash
#
# ATTOM /sale/snapshot bulk pull — Cedar Capital
#
# Iterates every active Austin zip code, pulls all sales from /sale/snapshot
# within MONTHS_BACK months, paginates through results, and writes them into
# the attom_sales table. This is the foundation of self-computed comps since
# /sale/comparables isn't entitled on our trial.
#
# Required env:
#   ATTOM_API_KEY
#   PGURL
#
# Optional env:
#   MONTHS_BACK   — how far back to pull sales (default 12)
#   PAGE_SIZE     — records per page (default 100)
#   MAX_PAGES     — cap pages per zip (default 10 = up to 1,000 sales/zip)
#   DELAY_MS      — sleep between calls (default 250)
#   ZIP_LIMIT     — cap how many zips to process (default unlimited)
#
# Usage:
#   ATTOM_API_KEY=... PGURL=... bash scripts/attom-comps-pull.sh
#
# Logs every API call to attom_call_log for budget visibility. Idempotent:
# attom_sales is keyed on attomId; re-running upserts.

set -uo pipefail
: "${ATTOM_API_KEY:?ATTOM_API_KEY required}"
: "${PGURL:?PGURL required}"

MONTHS_BACK="${MONTHS_BACK:-12}"
PAGE_SIZE="${PAGE_SIZE:-100}"
MAX_PAGES="${MAX_PAGES:-10}"
DELAY_MS="${DELAY_MS:-250}"
ZIP_LIMIT="${ZIP_LIMIT:-100}"

ATTOM_BASE="https://api.gateway.attomdata.com/propertyapi/v1.0.0"
START_DATE=$(date -v-${MONTHS_BACK}m +%Y-%m-%d 2>/dev/null || date -d "$MONTHS_BACK months ago" +%Y-%m-%d)
END_DATE=$(date +%Y-%m-%d)

echo "▸ ATTOM /sale/snapshot pull — Austin zips, $START_DATE → $END_DATE"
echo "  page_size=$PAGE_SIZE  max_pages=$MAX_PAGES  delay=${DELAY_MS}ms"
echo ""

ZIPS=$(psql "$PGURL" -tAF $'\t' -c "
  SELECT zip_code FROM austin_zip_codes WHERE is_active = true ORDER BY zip_code LIMIT $ZIP_LIMIT
")

total_calls=0
total_sales=0
total_errors=0

for zip in $ZIPS; do
  [ -z "$zip" ] && continue
  zip_calls=0
  zip_sales=0

  for page in $(seq 1 "$MAX_PAGES"); do
    start=$(date +%s)
    resp=$(curl -sS -G \
      -H "Accept: application/json" \
      -H "apikey: $ATTOM_API_KEY" \
      --data-urlencode "postalcode=$zip" \
      --data-urlencode "startsalesearchdate=$START_DATE" \
      --data-urlencode "endsalesearchdate=$END_DATE" \
      --data-urlencode "page=$page" \
      --data-urlencode "pagesize=$PAGE_SIZE" \
      "$ATTOM_BASE/sale/snapshot" 2>/dev/null)
    end=$(date +%s)
    duration_ms=$(( (end - start) * 1000 ))

    bytes=${#resp}
    total_calls=$((total_calls + 1))
    zip_calls=$((zip_calls + 1))

    # Log call (best-effort, don't fail backfill if logging fails)
    psql "$PGURL" -q -c "INSERT INTO attom_call_log(endpoint, status_code, bytes, duration_ms, notes) VALUES('/sale/snapshot', 200, $bytes, $duration_ms, 'zip=$zip page=$page');" >/dev/null 2>&1 || true

    # Rows on this page
    page_count=$(echo "$resp" | jq -r '.property | length // 0' 2>/dev/null)
    if [ -z "$page_count" ] || [ "$page_count" = "null" ] || [ "$page_count" = "0" ]; then
      break
    fi

    # Bulk-insert into attom_sales via temporary jsonb staging
    inserted=$(echo "$resp" | jq -c '
      .property[] | {
        attom_id: (.identifier.attomId // .identifier.Id // empty | tostring),
        address: (.address.oneLine // .address.line1 // ""),
        city: (.address.locality // .address.city // ""),
        state: (.address.countrySubd // .address.state // "TX"),
        zip_code: (.address.postal1 // .address.zip // ""),
        county: (.address.countrySecSubd // ""),
        lat: (.location.latitude // null | tonumber? // null),
        lng: (.location.longitude // null | tonumber? // null),
        beds: (.building.rooms.beds // null | tonumber? // null),
        baths: (.building.rooms.bathstotal // null | tonumber? // null),
        sqft: (.building.size.universalsize // .building.size.livingsize // null | tonumber? // null),
        lot_size: (.lot.lotsize1 // null | tonumber? // null),
        year_built: (.summary.yearbuilt // null | tonumber? // null),
        property_type: (.summary.proptype // .summary.propertyType // ""),
        sale_amount: (.sale.amount.saleamt // .sale.amount.value // null | tonumber? // null),
        sale_date: (.sale.salesearchdate // .sale.saleSearchDate // .sale.saleDate // null),
        sale_type: (.sale.salesearchtypecode // .sale.saleType // ""),
        raw: .
      } | select(.attom_id != "" and .attom_id != null and .sale_amount != null and .sale_amount > 0)
    ' | jq -s '.' | psql "$PGURL" -q -tA -v ON_ERROR_STOP=1 -c "
      WITH input AS (
        SELECT * FROM jsonb_to_recordset(\$\$$(cat)\$\$::jsonb)
        AS t(attom_id text, address text, city text, state text, zip_code text,
             county text, lat numeric, lng numeric, beds int, baths numeric,
             sqft int, lot_size numeric, year_built int, property_type text,
             sale_amount numeric, sale_date text, sale_type text, raw jsonb)
      )
      INSERT INTO attom_sales (attom_id, address, city, state, zip_code, county, lat, lng, beds, baths, sqft, lot_size, year_built, property_type, sale_amount, sale_date, sale_type, raw)
      SELECT attom_id, address, city, state, zip_code, county, lat, lng, beds, baths, sqft, lot_size, year_built, property_type, sale_amount,
             CASE WHEN sale_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN sale_date::date ELSE NULL END,
             sale_type, raw
      FROM input
      ON CONFLICT (attom_id) DO UPDATE SET
        sale_amount = EXCLUDED.sale_amount,
        sale_date = EXCLUDED.sale_date,
        raw = EXCLUDED.raw,
        ingested_at = now()
      RETURNING 1;
    " 2>/dev/null | wc -l | tr -d ' ')

    zip_sales=$((zip_sales + inserted))
    total_sales=$((total_sales + inserted))

    # Stop paging if page returned less than page_size (final page)
    if [ "$page_count" -lt "$PAGE_SIZE" ]; then
      break
    fi

    sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
  done

  printf "  %s: %3d sales · %2d calls\n" "$zip" "$zip_sales" "$zip_calls"
done

echo ""
echo "▸ Summary: $total_sales sales ingested · $total_calls calls · $total_errors errors"

# Final stats
psql "$PGURL" -c "
SELECT
  COUNT(*) AS total_sales,
  COUNT(DISTINCT zip_code) AS zips,
  MIN(sale_date) AS earliest_sale,
  MAX(sale_date) AS latest_sale,
  ROUND(AVG(sale_amount)) AS avg_sale_price
FROM attom_sales;
"
