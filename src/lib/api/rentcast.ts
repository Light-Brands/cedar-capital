/**
 * Rentcast API Client
 * Primary active-listings source for the Austin metro.
 * Aggregates MLS + partner sources. Includes sale comps.
 * https://developers.rentcast.io
 *
 * FSBO inference: `mlsName` is null/empty on for-sale-by-owner listings.
 */

import type { DiscoveredProperty, DiscoveryQuery, SalesComp } from './types'
import type { ListingsAdapter, ConnectionTestResult, SourceKind } from './source-adapter'
import { missingEnvKeys } from './source-adapter'

const RENTCAST_BASE_URL = 'https://api.rentcast.io/v1'
const RENTCAST_PAGE_SIZE = 100
const RENTCAST_MAX_PER_ZIP = 200

function getHeaders(): HeadersInit {
  const apiKey = process.env.RENTCAST_API_KEY
  if (!apiKey) throw new Error('RENTCAST_API_KEY not configured')
  return {
    'Accept': 'application/json',
    'X-Api-Key': apiKey,
  }
}

async function rentcastFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${RENTCAST_BASE_URL}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), { headers: getHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Rentcast API error ${res.status}: ${text}`)
  }
  return res.json()
}

// ============================================================
// Connection test — used by /dashboard/sources monitor
// ============================================================

export async function testConnection(): Promise<ConnectionTestResult> {
  const missing = missingEnvKeys(['RENTCAST_API_KEY'])
  if (missing.length > 0) {
    return {
      ok: false,
      status: 'needs_config',
      message: `Missing env keys: ${missing.join(', ')}`,
    }
  }

  const start = Date.now()
  try {
    // Minimal call: fetch a single Austin listing to validate key + subscription
    await rentcastFetch('/listings/sale', {
      city: 'Austin',
      state: 'TX',
      limit: '1',
    })
    return {
      ok: true,
      status: 'connected',
      message: 'Rentcast API reachable',
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Distinguish billing/subscription errors (key valid, account not paying)
    if (message.includes('401') || /billing|subscription/i.test(message)) {
      return {
        ok: false,
        status: 'needs_config',
        message: 'API key present but subscription inactive. Activate a tier at app.rentcast.io/app/api.',
        latencyMs: Date.now() - start,
      }
    }
    return {
      ok: false,
      status: 'failing',
      message,
      latencyMs: Date.now() - start,
    }
  }
}

// ============================================================
// Discovery — active sale listings
// ============================================================

/**
 * Discover active sale listings across the given zip codes.
 * Filters to `status=Active` only (Kelly's self-verify rule).
 */
export async function discover(query: DiscoveryQuery): Promise<DiscoveredProperty[]> {
  const properties: DiscoveredProperty[] = []

  for (const zip of query.zipCodes) {
    let offset = 0
    let fetched = 0

    while (fetched < RENTCAST_MAX_PER_ZIP) {
      const params: Record<string, string> = {
        zipCode: zip,
        status: 'Active',
        limit: String(RENTCAST_PAGE_SIZE),
        offset: String(offset),
      }

      if (query.minPrice) params.minPrice = String(query.minPrice)
      if (query.maxPrice) params.maxPrice = String(query.maxPrice)
      if (query.minBeds) params.bedrooms = String(query.minBeds)

      let page: unknown[]
      try {
        const data = await rentcastFetch('/listings/sale', params)
        page = Array.isArray(data) ? data : []
      } catch (err) {
        console.error(`Rentcast discover error for ${zip}:`, err)
        break
      }

      if (page.length === 0) break

      for (const record of page) {
        const prop = mapListing(record as Record<string, unknown>)
        if (prop) properties.push(prop)
      }

      fetched += page.length
      offset += page.length
      if (page.length < RENTCAST_PAGE_SIZE) break
    }
  }

  return properties
}

// ============================================================
// Sales comps
// ============================================================

/**
 * Get sales comps for a target property via Rentcast's valuation endpoint.
 * Returns normalized SalesComp[] ready for comps.ts filterComps().
 */
export async function getSalesComps(
  address: string,
  city: string,
  state: string,
  zip: string,
  radius: number = 0.5,
  maxComps: number = 10
): Promise<SalesComp[]> {
  try {
    const data = await rentcastFetch('/avm/value', {
      address: `${address}, ${city}, ${state} ${zip}`,
      compCount: String(maxComps),
    }) as Record<string, unknown>

    const comparables = (data.comparables as Record<string, unknown>[] | undefined) ?? []
    return comparables
      .map(mapComp)
      .filter((c): c is SalesComp => c !== null)
      .filter(c => c.distanceMiles <= radius)
  } catch (err) {
    console.error(`Rentcast comps error:`, err)
    return []
  }
}

// ============================================================
// Mappers
// ============================================================

function mapListing(record: Record<string, unknown>): DiscoveredProperty | null {
  const address = String(record.formattedAddress ?? record.addressLine1 ?? '')
  if (!address) return null

  const mlsName = record.mlsName as string | null | undefined
  const isFSBO = !mlsName || mlsName === ''

  const listingAgent = (record.listingAgent || {}) as Record<string, unknown>
  const photos = Array.isArray(record.photos)
    ? (record.photos as unknown[]).map(p => typeof p === 'string' ? p : String((p as Record<string, unknown>).url ?? ''))
      .filter(Boolean)
    : undefined

  return {
    address,
    city: String(record.city ?? 'Austin'),
    state: String(record.state ?? 'TX'),
    zipCode: String(record.zipCode ?? ''),
    county: record.county ? String(record.county) : undefined,
    lat: typeof record.latitude === 'number' ? record.latitude : undefined,
    lng: typeof record.longitude === 'number' ? record.longitude : undefined,
    beds: typeof record.bedrooms === 'number' ? record.bedrooms : undefined,
    baths: typeof record.bathrooms === 'number' ? record.bathrooms : undefined,
    sqft: typeof record.squareFootage === 'number' ? record.squareFootage : undefined,
    lotSize: typeof record.lotSize === 'number' ? record.lotSize : undefined,
    yearBuilt: typeof record.yearBuilt === 'number' ? record.yearBuilt : undefined,
    propertyType: mapPropertyType(record.propertyType as string | undefined),
    listType: isFSBO ? 'FSBO' : 'Listed',
    source: 'rentcast',
    sourceId: String(record.id ?? ''),
    askingPrice: typeof record.price === 'number' ? record.price : undefined,
    daysOnMarket: typeof record.daysOnMarket === 'number' ? record.daysOnMarket : undefined,
    link: undefined,
    photos: photos && photos.length > 0 ? photos : undefined,
    rawData: {
      ...record,
      _agent_name: listingAgent.name ?? null,
      _agent_phone: listingAgent.phone ?? null,
      _agent_email: listingAgent.email ?? null,
      _listing_status: record.status ?? 'Active',
      _mls_name: mlsName ?? null,
    },
  }
}

function mapComp(record: Record<string, unknown>): SalesComp | null {
  const address = String(record.formattedAddress ?? record.addressLine1 ?? '')
  const salePrice = Number(record.price ?? record.lastSalePrice ?? 0)
  const sqft = Number(record.squareFootage ?? 0)

  if (!address || !salePrice || !sqft) return null

  return {
    address,
    salePrice,
    sqft,
    beds: Number(record.bedrooms ?? 0),
    baths: Number(record.bathrooms ?? 0),
    saleDate: String(record.lastSaleDate ?? record.listedDate ?? ''),
    distanceMiles: typeof record.distance === 'number' ? record.distance : 0,
  }
}

function mapPropertyType(raw?: string): string {
  if (!raw) return 'SFR'
  const normalized = raw.toLowerCase()
  if (normalized.includes('single')) return 'SFR'
  if (normalized.includes('condo')) return 'Condo'
  if (normalized.includes('town')) return 'Townhouse'
  if (normalized.includes('multi') || normalized.includes('duplex')) return 'Multi'
  if (normalized.includes('land') || normalized.includes('lot')) return 'Land'
  return 'SFR'
}

// ============================================================
// Adapter export — conforms to ListingsAdapter contract
// ============================================================

export const rentcastAdapter: ListingsAdapter = {
  slug: 'rentcast',
  kind: 'listings' satisfies SourceKind,
  requiredEnvKeys: ['RENTCAST_API_KEY'],
  testConnection,
  discover,
}
