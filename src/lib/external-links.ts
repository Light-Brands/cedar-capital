/**
 * Deterministic external links for any property address.
 *
 * All four targets accept an address in a predictable URL format and either
 * resolve directly to the listing/parcel or land Kelly on a relevant search
 * page. No API calls, no keys — the link itself is the lookup.
 *
 *   Zillow        → specific listing if known, else address-nearby search
 *   Realtor.com   → specific listing if known, else search
 *   Google Maps   → satellite + street view (works for every valid address)
 *   TCAD          → authoritative parcel record (Travis County only, needs tcad_prop_id)
 */

/** Zillow slug format: lowercase alphanumeric + hyphens, no commas or punctuation. */
export function toZillowUrl(address: string | null | undefined): string | null {
  if (!address) return null
  const slug = address
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  if (!slug) return null
  return `https://www.zillow.com/homes/${slug}_rb/`
}

/** Realtor.com accepts a URL-encoded address on their search path. */
export function toRealtorUrl(address: string | null | undefined): string | null {
  if (!address) return null
  const slug = address
    .replace(/,/g, '')
    .replace(/[^\w\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  if (!slug) return null
  return `https://www.realtor.com/realestateandhomes-search/${slug}`
}

/** Google Maps deep-link — drops a pin + opens Street View when available. */
export function toGoogleMapsUrl(address: string | null | undefined): string | null {
  if (!address) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/**
 * Travis CAD parcel record. The old subdomain (propaccess.traviscad.org)
 * went dead mid-2025; TCAD consolidated onto the main site's property search.
 */
export function toTcadUrl(propId: string | null | undefined): string | null {
  if (!propId) return null
  return `https://traviscad.org/propertysearch?prop_id=${encodeURIComponent(propId)}`
}

/**
 * Redfin homes search by address. Redfin doesn't expose an address→listing
 * deep link, so this goes to their homes page with the address as query.
 */
export function toRedfinUrl(address: string | null | undefined): string | null {
  if (!address) return null
  const slug = address
    .replace(/,/g, '')
    .replace(/[^\w\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  if (!slug) return null
  return `https://www.redfin.com/homes/${slug}`
}
