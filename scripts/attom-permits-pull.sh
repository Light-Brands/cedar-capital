#!/usr/bin/env bash
#
# ATTOM building permits pull — Cedar Capital
# Hits /property/buildingpermits for the top 100 hot leads, persists permits
# to attom_building_permits + summary stats (count, latest date, recent value)
# onto the properties row.

set -uo pipefail
: "${ATTOM_API_KEY:?ATTOM_API_KEY required}"
: "${PGURL:?PGURL required}"

LIMIT="${LIMIT:-100}"
DELAY_MS="${DELAY_MS:-250}"
ATTOM_BASE="https://api.gateway.attomdata.com/propertyapi/v1.0.0"

echo "▸ ATTOM building permits pull — top $LIMIT hot leads"

ROWS=$(psql "$PGURL" -tAF $'\t' -c "
  SELECT p.id, p.address, p.zip_code
  FROM hot_leads h JOIN properties p ON p.id = h.id
  WHERE p.attom_permit_count IS NULL
  ORDER BY h.hot_score DESC
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
    "$ATTOM_BASE/property/buildingpermits" 2>/dev/null)
  bytes=${#resp}

  psql "$PGURL" -q -c "INSERT INTO attom_call_log(endpoint, status_code, bytes, property_id, notes) VALUES('/property/buildingpermits', 200, $bytes, '$id', 'permits pull');" >/dev/null 2>&1 || true

  if echo "$resp" | jq -e '.Response.status.code == "401" or .Response.status.msg == "Unauthorized"' >/dev/null 2>&1; then
    echo "  [$count/$LIMIT] $street — 401 RATE LIMIT, aborting"
    exit 2
  fi
  attom_id=$(echo "$resp" | jq -r '.property[0].identifier.attomId // empty')
  permit_count=$(echo "$resp" | jq -r '.property[0].buildingPermits | length // 0' 2>/dev/null)

  if [ -z "$attom_id" ] || [ "$permit_count" = "0" ] || [ "$permit_count" = "null" ]; then
    miss=$((miss + 1))
    psql "$PGURL" -q -c "UPDATE properties SET attom_permit_count = 0 WHERE id = '$id'" >/dev/null
    sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
    continue
  fi

  # Insert each permit + roll up summary
  echo "$resp" | jq -c --arg pid "$id" --arg attom_id "$attom_id" '
    .property[0].buildingPermits[] | {
      property_id: $pid,
      attom_id: $attom_id,
      permit_number: (.permitNumber // null | tostring),
      permit_type: (.type // .permitType // null),
      description: (.description // null),
      effective_date: (.effectiveDate // .date // null),
      amount: (.jobValue // .amount // null | tonumber? // null),
      raw: .
    }
  ' | while read -r permit; do
    psql "$PGURL" -q -v ON_ERROR_STOP=1 -v p="$permit" <<'SQL' >/dev/null
INSERT INTO attom_building_permits (
  property_id, attom_id, permit_number, permit_type, description, effective_date, amount, raw
) SELECT
  (:'p'::jsonb->>'property_id')::uuid,
  :'p'::jsonb->>'attom_id',
  :'p'::jsonb->>'permit_number',
  :'p'::jsonb->>'permit_type',
  :'p'::jsonb->>'description',
  CASE WHEN :'p'::jsonb->>'effective_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN (:'p'::jsonb->>'effective_date')::date ELSE NULL END,
  NULLIF(:'p'::jsonb->>'amount','null')::numeric,
  :'p'::jsonb->'raw';
SQL
  done

  # Roll up summary onto properties row
  psql "$PGURL" -q -c "
    UPDATE properties SET
      attom_permit_count = (SELECT COUNT(*) FROM attom_building_permits WHERE property_id = '$id'),
      attom_latest_permit_date = (SELECT MAX(effective_date) FROM attom_building_permits WHERE property_id = '$id'),
      attom_recent_permit_value = (SELECT SUM(amount) FROM attom_building_permits WHERE property_id = '$id' AND effective_date >= CURRENT_DATE - interval '5 years')
    WHERE id = '$id';
  " >/dev/null

  hit=$((hit + 1))
  if [ $((count % 25)) -eq 0 ]; then
    echo "  [$count/$LIMIT] $street — $permit_count permits"
  fi
  sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
done <<< "$ROWS"

echo ""
echo "▸ Summary: $hit with permits · $miss no permits · $count total"
