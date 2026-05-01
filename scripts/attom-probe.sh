#!/usr/bin/env bash
# Comprehensive ATTOM endpoint entitlement probe
set -u
: "${ATTOM_API_KEY:?ATTOM_API_KEY required}"

BASE="https://api.gateway.attomdata.com/propertyapi/v1.0.0"

probe() {
  local path="$1"; shift
  local resp http_code
  # Build curl args; trailing args are --data-urlencode pairs
  local curl_args=(-sS -G -H "Accept: application/json" -H "apikey: $ATTOM_API_KEY")
  for arg in "$@"; do curl_args+=(--data-urlencode "$arg"); done
  curl_args+=("$BASE$path")

  resp=$(curl "${curl_args[@]}" 2>/dev/null)

  if echo "$resp" | jq -e '.Response.status.code == "404"' >/dev/null 2>&1; then
    printf "  ❌  %-40s NOT ENTITLED\n" "$path"
  elif echo "$resp" | jq -e '.status.code == 0 and (.status.msg | tostring | test("Success"))' >/dev/null 2>&1; then
    local total
    total=$(echo "$resp" | jq -r '.status.total // "ok"')
    printf "  ✅  %-40s entitled · total=%s\n" "$path" "$total"
  else
    local snippet
    snippet=$(echo "$resp" | jq -r '.status.msg // .Response.status.msg // .' 2>/dev/null | head -c 70)
    printf "  ⚠   %-40s %s\n" "$path" "$snippet"
  fi
}

# Use 4529 WINONA CT, DENVER CO 80212 — confirmed working earlier
ADDR1="address1=4529 Winona Court"
ADDR2="address2=Denver, CO"
ZIP_AUSTIN="postalcode=78704"
PAGE1="pagesize=1"

echo "=== Property Search / Detail ==="
probe "/property/address" "$ZIP_AUSTIN" "$PAGE1"
probe "/property/snapshot" "$ZIP_AUSTIN" "$PAGE1"
probe "/property/basicprofile" "$ADDR1" "$ADDR2"
probe "/property/detail" "$ADDR1" "$ADDR2"
probe "/property/expandedprofile" "$ADDR1" "$ADDR2"
probe "/property/buildingpermits" "$ADDR1" "$ADDR2"
probe "/property/detailmortgage" "$ADDR1" "$ADDR2"
probe "/property/detailowner" "$ADDR1" "$ADDR2"
probe "/property/detailwithschools" "$ADDR1" "$ADDR2"
probe "/property/detailmortgageowner" "$ADDR1" "$ADDR2"

echo ""
echo "=== Sale History ==="
probe "/sale/snapshot" "$ZIP_AUSTIN" "$PAGE1" "startsalesearchdate=2024-01-01" "endsalesearchdate=2024-12-31"
probe "/sale/detail" "$ADDR1" "$ADDR2"
probe "/saleshistory/basichistory" "$ADDR1" "$ADDR2"
probe "/saleshistory/expandedhistory" "$ADDR1" "$ADDR2"
probe "/saleshistory/detail" "$ADDR1" "$ADDR2"
probe "/saleshistory/snapshot" "$ZIP_AUSTIN" "$PAGE1" "startsalesearchdate=2024-01-01" "endsalesearchdate=2024-12-31"

echo ""
echo "=== Assessment ==="
probe "/assessment/snapshot" "$ZIP_AUSTIN" "$PAGE1"
probe "/assessment/detail" "$ADDR1" "$ADDR2"
probe "/assessmenthistory/detail" "$ADDR1" "$ADDR2"

echo ""
echo "=== AVM / Valuation ==="
probe "/avm/detail" "$ADDR1" "$ADDR2"
probe "/avm/snapshot" "$ZIP_AUSTIN" "$PAGE1"
probe "/avmhistory/detail" "$ADDR1" "$ADDR2"
probe "/valuation/homeequity" "$ADDR1" "$ADDR2"
probe "/valuation/rentalavm" "$ADDR1" "$ADDR2"

echo ""
echo "=== Comps / Pre-foreclosure ==="
probe "/sale/comparables" "$ADDR1" "$ADDR2" "radius=0.5" "$PAGE1"
probe "/property/preforeclosure" "$ZIP_AUSTIN" "$PAGE1"
probe "/property/foreclosurehistory" "$ADDR1" "$ADDR2"
probe "/saleshistory/foreclosure" "$ADDR1" "$ADDR2"

echo ""
echo "=== Schools / POI ==="
probe "/school/snapshot" "$ZIP_AUSTIN" "$PAGE1"
probe "/school/profile" "$ADDR1" "$ADDR2"
probe "/poi/streetaddress" "address=4529 Winona Court Denver CO" "categoryName=GROCERIES"

echo ""
echo "=== Areas / Community / Boundary ==="
probe "/area/hierarchy/lookup" "name=Austin"
probe "/community/profile" "address=4529 Winona Court Denver CO"
probe "/areaapi/area/boundary/detail" "address=4529 Winona Court Denver CO"

echo ""
echo "=== Transportation Noise ==="
probe "/transportationnoise" "$ADDR1" "$ADDR2"
