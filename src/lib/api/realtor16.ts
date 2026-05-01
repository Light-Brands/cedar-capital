/**
 * Realtor.com via realtor16 (RapidAPI)
 * Tertiary listings source for inventory dedupe.
 * Note: sold_price is often redacted — NOT reliable for comps.
 * https://rapidapi.com/s.mahmoud97/api/realtor16
 */

import type { DiscoveredProperty, DiscoveryQuery } from './types'
import type { ListingsAdapter, ConnectionTestResult, SourceKind } from './source-adapter'
import { missingEnvKeys } from './source-adapter'

const API_HOST = 'realtor16.p.rapidapi.com'
const FORSALE_URL = `https://${API_HOST}/search/forsale`
const PAGE_SIZE = 50
const MAX_PAGES_PER_ZIP = 4

function getHeaders(): HeadersInit {
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) throw new Error('RAPIDAPI_KEY not configured')
  return {
    'Content-Type': 'application/json',
    'x-rapidapi-host': API_HOST,
    'x-rapidapi-key': apiKey,
  }
}

interface Realtor16Response {
  count: number
  total: number
  properties: unknown[]
}

async function searchForSale(location: string, page: number, limit: number): Promise<unknown[]> {
  const url = new URL(FORSALE_URL)
  url.searchParams.set('location', location)
  url.searchParams.set('page', String(page))
  url.searchParams.set('limit', String(limit))

  const res = await fetch(url.toString(), { headers: getHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`realtor16 error ${res.status}: ${text}`)
  }
  const data = await res.json() as Realtor16Response
  return Array.isArray(data.properties) ? data.properties : []
}

export async function testConnection(): Promise<ConnectionTestResult> {
  const missing = missingEnvKeys(['RAPIDAPI_KEY'])
  if (missing.length > 0) {
    return { ok: false, status: 'needs_config', message: `Missing env keys: ${missing.join(', ')}` }
  }
  const start = Date.now()
  try {
    await searchForSale('Austin, TX', 1, 1)
    return {
      ok: true,
      status: 'connected',
      message: 'realtor16 reachable',
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      status: /401|403/.test(message) ? 'needs_config' : 'failing',
      message,
      latencyMs: Date.now() - start,
    }
  }
}

/**
 * realtor16's /search/forsale is location-based, not zip-based.
 * We query once per zip by passing "<zip>, Austin, TX" as location.
 * This is less efficient than realty-in-us's postal_code param — treat realtor16
 * as a DEDUPE signal layered on top of other sources, not a primary firehose.
 */
export async function discover(query: DiscoveryQuery): Promise<DiscoveredProperty[]> {
  const properties: DiscoveredProperty[] = []

  for (const zip of query.zipCodes) {
    for (let page = 1; page <= MAX_PAGES_PER_ZIP; page++) {
      let pageRows: unknown[]
      try {
        pageRows = await searchForSale(`${zip}, Austin, TX`, page, PAGE_SIZE)
      } catch (err) {
        console.error(`realtor16 discover error for ${zip}:`, err)
        break
      }
      if (pageRows.length === 0) break
      for (const record of pageRows) {
        const prop = mapListing(record as Record<string, unknown>)
        if (prop) properties.push(prop)
      }
      if (pageRows.length < PAGE_SIZE) break
    }
  }

  return properties
}

function firstNumber(v: unknown): number | undefined {
  // realtor16 returns `[]` for null numerics; real values come through as numbers.
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  return undefined
}

function mapListing(record: Record<string, unknown>): DiscoveredProperty | null {
  const location = (record.location || {}) as Record<string, unknown>
  const address = (location.address || {}) as Record<string, unknown>
  const coord = (address.coordinate || {}) as Record<string, unknown>
  const description = (record.description || {}) as Record<string, unknown>
  const flags = (record.flags || {}) as Record<string, unknown>
  const branding = (record.branding as Record<string, unknown>[] | undefined) ?? []
  const advertisers = (record.advertisers as Record<string, unknown>[] | undefined) ?? []

  const line = String(address.line ?? '')
  const city = String(address.city ?? 'Austin')
  const state = String(address.state_code ?? 'TX')
  const zip = String(address.postal_code ?? '')
  if (!line || !zip) return null

  // FSBO inference: no branding or branding.type != 'Office' → potentially FSBO
  const hasOfficeBranding = branding.some(b => (b as Record<string, unknown>)?.type === 'Office' && (b as Record<string, unknown>)?.name)
  const isFSBO = !hasOfficeBranding

  let listingStatus: 'Active' | 'Pending' | 'Closed' | 'Expired' | 'Unknown' = 'Active'
  if (flags.is_pending === true) listingStatus = 'Pending'
  else if (flags.is_contingent === true) listingStatus = 'Pending'
  else if (flags.is_coming_soon === true) listingStatus = 'Unknown'

  const listPrice = firstNumber(record.list_price) ?? firstNumber(record.price)
  const firstSeller = advertisers.find(a => (a as Record<string, unknown>)?.type === 'seller') as
    | Record<string, unknown> | undefined

  // Hunt for freeform listing remarks across known realtor16 shapes. The
  // /search/forsale endpoint typically does NOT include remarks (verified
  // 2026-04-30 against 470 stored rows — only structured fields), but if the
  // upstream response shape evolves OR the caller hits /property/{id}/details
  // and merges, we want it captured. Cheap to look for, free if absent.
  const descriptionText =
    pickString(description.text) ??
    pickString(record.public_remarks) ??
    pickString(record.remarks) ??
    pickString((record as Record<string, unknown>).description_text) ??
    null

  return {
    address: [line, city, state, zip].join(', '),
    city,
    state,
    zipCode: zip,
    county: undefined,
    lat: firstNumber(coord.lat),
    lng: firstNumber(coord.lon),
    beds: firstNumber(description.beds),
    baths: firstNumber(description.baths) ?? firstNumber(description.baths_full),
    sqft: firstNumber(description.sqft),
    lotSize: firstNumber(description.lot_sqft),
    yearBuilt: firstNumber(description.year_built),
    propertyType: mapPropertyType(description.type as string | undefined),
    listType: isFSBO ? 'FSBO' : 'Listed',
    source: 'realtor16',
    sourceId: String(record.property_id ?? record.listing_id ?? ''),
    askingPrice: listPrice,
    daysOnMarket: firstNumber(record.days_on_market),
    link: record.href ? String(record.href) : undefined,
    photos: undefined,
    rawData: {
      ...record,
      _agent_name: firstSeller?.name ?? null,
      _listing_status: listingStatus,
      _brokerage: branding[0]?.name ?? null,
      _description_text: descriptionText,
    },
  }
}

function pickString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed.length >= 10 ? trimmed : null
}

function mapPropertyType(raw?: string): string {
  if (!raw) return 'SFR'
  const n = raw.toLowerCase()
  if (n.includes('single')) return 'SFR'
  if (n.includes('condo')) return 'Condo'
  if (n.includes('town')) return 'Townhouse'
  if (n.includes('multi') || n.includes('duplex')) return 'Multi'
  if (n.includes('land') || n.includes('lot')) return 'Land'
  if (n.includes('mobile') || n.includes('manufactured')) return 'Mobile'
  return 'SFR'
}

export const realtor16Adapter: ListingsAdapter = {
  slug: 'realtor16',
  kind: 'listings' satisfies SourceKind,
  requiredEnvKeys: ['RAPIDAPI_KEY'],
  testConnection,
  discover,
}
