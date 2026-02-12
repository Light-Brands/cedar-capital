/**
 * ATTOM Data API Client
 * Primary source for property discovery, details, valuations, and comps.
 * https://api.gateway.attomdata.com/propertyapi/v1.0.0
 */

import type { DiscoveredProperty, SalesComp, PropertyValuation, DiscoveryQuery } from './types'

const ATTOM_BASE_URL = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0'

function getHeaders(): HeadersInit {
  const apiKey = process.env.ATTOM_API_KEY
  if (!apiKey) throw new Error('ATTOM_API_KEY not configured')
  return {
    'Accept': 'application/json',
    'apikey': apiKey,
  }
}

async function attomFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${ATTOM_BASE_URL}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), { headers: getHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ATTOM API error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * Discover pre-foreclosure properties in given zip codes.
 */
export async function discoverPreForeclosures(zipCodes: string[]): Promise<DiscoveredProperty[]> {
  const properties: DiscoveredProperty[] = []

  for (const zip of zipCodes) {
    try {
      const data = await attomFetch('/property/preforeclosure', {
        postalcode: zip,
        pagesize: '50',
      }) as Record<string, unknown>

      const records = extractPropertyRecords(data)
      for (const record of records) {
        properties.push(mapAttomProperty(record, 'Pre-foreclosure', 'attom'))
      }
    } catch (err) {
      console.error(`ATTOM pre-foreclosure error for ${zip}:`, err)
    }
  }

  return properties
}

/**
 * Discover distressed/below-market properties using ATTOM's property search.
 */
export async function discoverDistressed(query: DiscoveryQuery): Promise<DiscoveredProperty[]> {
  const properties: DiscoveredProperty[] = []

  for (const zip of query.zipCodes) {
    try {
      const params: Record<string, string> = {
        postalcode: zip,
        pagesize: '50',
      }
      if (query.minPrice) params.minvalue = String(query.minPrice)
      if (query.maxPrice) params.maxvalue = String(query.maxPrice)
      if (query.minBeds) params.minbeds = String(query.minBeds)
      if (query.maxBeds) params.maxbeds = String(query.maxBeds)

      const data = await attomFetch('/property/snapshot', params) as Record<string, unknown>
      const records = extractPropertyRecords(data)

      for (const record of records) {
        const prop = mapAttomProperty(record, query.listTypes?.[0] ?? 'MLS', 'attom')
        // Include if: price data missing (can't filter) OR price is below 85% of estimated value
        if (!prop.askingPrice || !prop.estimatedValue || prop.askingPrice < prop.estimatedValue * 0.85) {
          properties.push(prop)
        }
      }
    } catch (err) {
      console.error(`ATTOM distressed search error for ${zip}:`, err)
    }
  }

  return properties
}

/**
 * Get detailed property info by address.
 */
export async function getPropertyDetails(address: string, zip: string): Promise<DiscoveredProperty | null> {
  try {
    const data = await attomFetch('/property/detail', {
      address1: address,
      address2: zip,
    }) as Record<string, unknown>

    const records = extractPropertyRecords(data)
    if (records.length === 0) return null
    return mapAttomProperty(records[0], 'MLS', 'attom')
  } catch (err) {
    console.error(`ATTOM property detail error:`, err)
    return null
  }
}

/**
 * Get AVM (Automated Valuation Model) for a property.
 */
export async function getValuation(address: string, zip: string): Promise<PropertyValuation | null> {
  try {
    const data = await attomFetch('/valuation/homeequity', {
      address1: address,
      address2: zip,
    }) as Record<string, unknown>

    const records = extractPropertyRecords(data)
    if (records.length === 0) return null

    const record = records[0] as Record<string, unknown>
    const avm = (record.avm || record.valuation || {}) as Record<string, unknown>
    const amount = (avm.amount || avm.estimatedValue || avm.value) as Record<string, unknown> | undefined
    const value = Number(amount?.value ?? amount?.scr ?? 0)

    return {
      estimatedValue: value,
      valuationDate: new Date().toISOString().split('T')[0],
      confidence: value > 0 ? 'medium' : 'low',
      source: 'attom-avm',
    }
  } catch (err) {
    console.error(`ATTOM valuation error:`, err)
    return null
  }
}

/**
 * Get sales comps for a property.
 */
export async function getSalesComps(
  address: string,
  zip: string,
  radius: number = 0.5,
  maxComps: number = 10
): Promise<SalesComp[]> {
  try {
    const data = await attomFetch('/sale/comparables', {
      address1: address,
      address2: zip,
      radius: String(radius),
      pagesize: String(maxComps),
    }) as Record<string, unknown>

    const records = extractPropertyRecords(data)
    return records.map(mapAttomToComp).filter((c): c is SalesComp => c !== null)
  } catch (err) {
    console.error(`ATTOM comps error:`, err)
    return []
  }
}

// ---------- Helpers ----------

function extractPropertyRecords(data: unknown): Record<string, unknown>[] {
  const d = data as Record<string, unknown>
  const propWrapper = d.property as Record<string, unknown>[] | undefined
  if (Array.isArray(propWrapper)) return propWrapper as Record<string, unknown>[]

  const status = d.status as Record<string, unknown> | undefined
  if (status?.msg === 'SuccessWithResult' || status?.total) {
    const inner = d.property ?? d.properties ?? d.result ?? d.data
    if (Array.isArray(inner)) return inner as Record<string, unknown>[]
  }

  return []
}

function mapAttomProperty(
  record: Record<string, unknown>,
  listType: string,
  source: string
): DiscoveredProperty {
  const addr = (record.address || {}) as Record<string, unknown>
  const building = (record.building || {}) as Record<string, unknown>
  const lot = (record.lot || {}) as Record<string, unknown>
  const summary = (record.summary || {}) as Record<string, unknown>
  const sale = (record.sale || record.saleHistory || {}) as Record<string, unknown>
  const assessment = (record.assessment || {}) as Record<string, unknown>
  const assessed = (assessment.assessed || {}) as Record<string, unknown>
  const market = (assessment.market || {}) as Record<string, unknown>
  const avm = (record.avm || {}) as Record<string, unknown>
  const avmAmount = (avm.amount || {}) as Record<string, unknown>
  const location = (record.location || {}) as Record<string, unknown>

  const rooms = (building.rooms || {}) as Record<string, unknown>
  const size = (building.size || {}) as Record<string, unknown>
  const saleAmount = ((sale.amount || sale.saleAmountData || {}) as Record<string, unknown>)
  const listing = (record.listing || {}) as Record<string, unknown>
  const listingAmount = (listing.amount || listing.listingAmount || {}) as Record<string, unknown>

  // askingPrice comes from active listing data; lastSalePrice from historical sale
  const lastSalePrice = Number(saleAmount.saleamt ?? saleAmount.value ?? 0) || undefined
  const askingPrice = Number(listingAmount.value ?? listingAmount.listprice ?? 0) || undefined

  return {
    address: String(addr.oneLine ?? addr.line1 ?? ''),
    city: String(addr.locality ?? addr.city ?? 'Austin'),
    state: String(addr.countrySubd ?? addr.state ?? 'TX'),
    zipCode: String(addr.postal1 ?? addr.zip ?? ''),
    county: String(addr.countrySecSubd ?? addr.county ?? ''),
    lat: Number(location.latitude ?? 0) || undefined,
    lng: Number(location.longitude ?? 0) || undefined,
    beds: Number(rooms.beds ?? rooms.bedrooms ?? 0) || undefined,
    baths: Number(rooms.bathstotal ?? rooms.baths ?? 0) || undefined,
    sqft: Number(size.universalsize ?? size.livingsize ?? 0) || undefined,
    lotSize: Number(lot.lotsize1 ?? lot.lotSize ?? 0) || undefined,
    yearBuilt: Number(summary.yearbuilt ?? building.yearBuilt ?? 0) || undefined,
    propertyType: String(summary.proptype ?? summary.propertyType ?? 'SFR'),
    listType,
    source,
    sourceId: String(record.identifier ?? record.attomId ?? record.id ?? ''),
    askingPrice,
    estimatedValue: Number(avmAmount.value ?? avmAmount.scr ?? 0) || undefined,
    taxAssessedValue: Number(assessed.assdttlvalue ?? market.mktttlvalue ?? 0) || undefined,
    lastSalePrice,
    lastSaleDate: String(sale.saleSearchDate ?? sale.saleDate ?? ''),
    link: undefined,
    rawData: record,
  }
}

function mapAttomToComp(record: Record<string, unknown>): SalesComp | null {
  const addr = (record.address || {}) as Record<string, unknown>
  const building = (record.building || {}) as Record<string, unknown>
  const rooms = (building.rooms || {}) as Record<string, unknown>
  const size = (building.size || {}) as Record<string, unknown>
  const sale = (record.sale || {}) as Record<string, unknown>
  const saleAmount = (sale.amount || {}) as Record<string, unknown>

  const price = Number(saleAmount.saleamt ?? saleAmount.value ?? 0)
  const sqft = Number(size.universalsize ?? size.livingsize ?? 0)
  if (!price || !sqft) return null

  return {
    address: String(addr.oneLine ?? ''),
    salePrice: price,
    sqft,
    beds: Number(rooms.beds ?? 0),
    baths: Number(rooms.bathstotal ?? 0),
    saleDate: String(sale.saleSearchDate ?? sale.saleDate ?? ''),
    distanceMiles: Number(record.distance ?? 0),
  }
}
