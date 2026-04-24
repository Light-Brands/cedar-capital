/**
 * Realty-in-US API Client (RapidAPI)
 * Realtor.com data via RapidAPI wrapper.
 * Verified Austin MLS coverage (274+ listings per zip).
 * https://rapidapi.com/apidojo/api/realty-in-us
 *
 * FSBO inference: source.agents is null/empty → FSBO-like.
 */

import type { DiscoveredProperty, DiscoveryQuery } from './types'
import type { ListingsAdapter, ConnectionTestResult, SourceKind } from './source-adapter'
import { missingEnvKeys } from './source-adapter'

const API_HOST = 'realty-in-us.p.rapidapi.com'
const API_URL = `https://${API_HOST}/properties/v3/list`
const PAGE_SIZE = 100
const MAX_PER_ZIP = 300

function getHeaders(): HeadersInit {
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) throw new Error('RAPIDAPI_KEY not configured')
  return {
    'Content-Type': 'application/json',
    'x-rapidapi-host': API_HOST,
    'x-rapidapi-key': apiKey,
  }
}

interface SearchBody {
  limit: number
  offset: number
  postal_code: string
  status: string[]
  sort: { direction: 'asc' | 'desc'; field: string }
}

async function search(body: SearchBody): Promise<unknown[]> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Realty-in-US error ${res.status}: ${text}`)
  }
  const data = await res.json() as Record<string, unknown>
  const homeSearch = (data?.data as Record<string, unknown> | undefined)?.home_search as
    | { results?: unknown[] } | undefined
  return homeSearch?.results ?? []
}

export async function testConnection(): Promise<ConnectionTestResult> {
  const missing = missingEnvKeys(['RAPIDAPI_KEY'])
  if (missing.length > 0) {
    return { ok: false, status: 'needs_config', message: `Missing env keys: ${missing.join(', ')}` }
  }
  const start = Date.now()
  try {
    await search({
      limit: 1,
      offset: 0,
      postal_code: '78701',
      status: ['for_sale'],
      sort: { direction: 'desc', field: 'list_date' },
    })
    return {
      ok: true,
      status: 'connected',
      message: 'Realty-in-US reachable',
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

export async function discover(query: DiscoveryQuery): Promise<DiscoveredProperty[]> {
  const properties: DiscoveredProperty[] = []

  for (const zip of query.zipCodes) {
    let offset = 0
    let fetched = 0

    while (fetched < MAX_PER_ZIP) {
      let page: unknown[]
      try {
        page = await search({
          limit: PAGE_SIZE,
          offset,
          postal_code: zip,
          status: ['for_sale'],
          sort: { direction: 'desc', field: 'list_date' },
        })
      } catch (err) {
        console.error(`realty-in-us discover error for ${zip}:`, err)
        break
      }

      if (page.length === 0) break

      for (const record of page) {
        const prop = mapListing(record as Record<string, unknown>)
        if (prop) properties.push(prop)
      }

      fetched += page.length
      offset += page.length
      if (page.length < PAGE_SIZE) break
    }
  }

  return properties
}

function mapListing(record: Record<string, unknown>): DiscoveredProperty | null {
  const location = (record.location || {}) as Record<string, unknown>
  const address = (location.address || {}) as Record<string, unknown>
  const coord = (address.coordinate || {}) as Record<string, unknown>
  const county = (location.county || {}) as Record<string, unknown>
  const description = (record.description || {}) as Record<string, unknown>
  const flags = (record.flags || {}) as Record<string, unknown>
  const source = (record.source || {}) as Record<string, unknown>
  const advertisers = (record.advertisers as Record<string, unknown>[] | undefined) ?? []
  const branding = (record.branding as Record<string, unknown>[] | undefined) ?? []

  const line = String(address.line ?? '')
  const city = String(address.city ?? 'Austin')
  const state = String(address.state_code ?? 'TX')
  const zip = String(address.postal_code ?? '')
  if (!line || !zip) return null

  // FSBO detection: no MLS source agents → treat as FSBO candidate
  const mlsAgents = (source.agents as unknown[] | undefined) ?? []
  const hasMlsAgents = Array.isArray(mlsAgents) && mlsAgents.length > 0
  const hasBranding = branding.length > 0 && branding.some(b => b && typeof b === 'object' && (b as Record<string, unknown>).name)
  const isFSBO = !hasMlsAgents && !hasBranding

  // Listing status from flags → our schema
  let listingStatus: 'Active' | 'Pending' | 'Closed' | 'Expired' | 'Unknown' = 'Active'
  if (flags.is_pending === true) listingStatus = 'Pending'
  else if (flags.is_contingent === true) listingStatus = 'Pending'
  else if (flags.is_coming_soon === true) listingStatus = 'Unknown'

  // Listing agent extraction
  const seller = advertisers.find(a => a && (a as Record<string, unknown>).type === 'seller') as
    | Record<string, unknown> | undefined

  const addressFull = [line, city, state, zip].filter(Boolean).join(', ')
  const href = record.href ? String(record.href) : undefined

  return {
    address: addressFull,
    city,
    state,
    zipCode: zip,
    county: county.fips_code ? `FIPS ${county.fips_code}` : undefined,
    lat: typeof coord.lat === 'number' ? coord.lat : undefined,
    lng: typeof coord.lon === 'number' ? coord.lon : undefined,
    beds: typeof description.beds === 'number' ? description.beds : undefined,
    baths: typeof description.baths === 'number' ? description.baths : undefined,
    sqft: typeof description.sqft === 'number' ? description.sqft : undefined,
    lotSize: typeof description.lot_sqft === 'number' ? description.lot_sqft : undefined,
    yearBuilt: typeof description.year_built === 'number' ? description.year_built : undefined,
    propertyType: mapPropertyType(description.type as string | undefined),
    listType: isFSBO ? 'FSBO' : 'Listed',
    source: 'realty_in_us',
    sourceId: String(record.property_id ?? record.listing_id ?? ''),
    askingPrice: typeof record.list_price === 'number' ? record.list_price : undefined,
    daysOnMarket: typeof record.days_on_market === 'number' ? record.days_on_market : undefined,
    link: href,
    photos: undefined,
    rawData: {
      ...record,
      _agent_name: seller?.name ?? null,
      _agent_email: seller?.email ?? null,
      _agent_phone: null, // RapidAPI wrapper does not expose phone on list endpoint
      _listing_status: listingStatus,
      _is_foreclosure: flags.is_foreclosure ?? null,
      _is_new_listing: flags.is_new_listing ?? null,
      _brokerage: branding[0]?.name ?? null,
    },
  }
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

export const realtyInUsAdapter: ListingsAdapter = {
  slug: 'realty_in_us',
  kind: 'listings' satisfies SourceKind,
  requiredEnvKeys: ['RAPIDAPI_KEY'],
  testConnection,
  discover,
}
