/**
 * Estated API Client
 * Fallback for property details and automated valuations (AVM).
 * https://estated.com/developers/docs
 */

import type { DiscoveredProperty, PropertyValuation, SalesComp } from './types'

const ESTATED_BASE_URL = 'https://apis.estated.com/v4'

function getApiKey(): string {
  const apiKey = process.env.ESTATED_API_KEY
  if (!apiKey) throw new Error('ESTATED_API_KEY not configured')
  return apiKey
}

/**
 * Get property details from Estated.
 */
export async function getPropertyDetails(
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<DiscoveredProperty | null> {
  try {
    const params = new URLSearchParams({
      token: getApiKey(),
      combined_address: `${address}, ${city}, ${state} ${zip}`,
    })

    const res = await fetch(`${ESTATED_BASE_URL}/property?${params}`)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Estated API error ${res.status}: ${text}`)
    }

    const data = await res.json() as Record<string, unknown>
    const propData = (data.data ?? data) as Record<string, unknown>
    if (!propData || propData.error) return null

    return mapEstatedProperty(propData)
  } catch (err) {
    console.error(`Estated property detail error:`, err)
    return null
  }
}

/**
 * Get AVM from Estated.
 */
export async function getValuation(
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<PropertyValuation | null> {
  try {
    const params = new URLSearchParams({
      token: getApiKey(),
      combined_address: `${address}, ${city}, ${state} ${zip}`,
    })

    const res = await fetch(`${ESTATED_BASE_URL}/property?${params}`)
    if (!res.ok) return null

    const data = await res.json() as Record<string, unknown>
    const propData = (data.data ?? data) as Record<string, unknown>
    const valuation = (propData.valuation ?? {}) as Record<string, unknown>
    const value = Number(valuation.value ?? valuation.estimatedValue ?? 0)

    if (!value) return null

    return {
      estimatedValue: value,
      valuationDate: String(valuation.date ?? new Date().toISOString().split('T')[0]),
      confidence: value > 0 ? 'medium' : 'low',
      source: 'estated-avm',
    }
  } catch (err) {
    console.error(`Estated valuation error:`, err)
    return null
  }
}

/**
 * Get sales history (as comps) from Estated for the property's area.
 */
export async function getSalesHistory(
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<SalesComp[]> {
  try {
    const params = new URLSearchParams({
      token: getApiKey(),
      combined_address: `${address}, ${city}, ${state} ${zip}`,
    })

    const res = await fetch(`${ESTATED_BASE_URL}/property?${params}`)
    if (!res.ok) return []

    const data = await res.json() as Record<string, unknown>
    const propData = (data.data ?? data) as Record<string, unknown>
    const deeds = (propData.deeds ?? []) as Record<string, unknown>[]

    return deeds
      .filter(d => Number(d.sale_price ?? 0) > 0)
      .map(d => ({
        address: String((propData.address as Record<string, unknown>)?.full_address ?? address),
        salePrice: Number(d.sale_price),
        sqft: Number((propData.structure as Record<string, unknown>)?.total_area_sq_ft ?? 0),
        beds: Number((propData.structure as Record<string, unknown>)?.beds_count ?? 0),
        baths: Number((propData.structure as Record<string, unknown>)?.baths ?? 0),
        saleDate: String(d.sale_date ?? d.recording_date ?? ''),
        distanceMiles: 0,
      }))
  } catch (err) {
    console.error(`Estated sales history error:`, err)
    return []
  }
}

// ---------- Helpers ----------

function mapEstatedProperty(propData: Record<string, unknown>): DiscoveredProperty {
  const addr = (propData.address ?? {}) as Record<string, unknown>
  const structure = (propData.structure ?? {}) as Record<string, unknown>
  const parcel = (propData.parcel ?? {}) as Record<string, unknown>
  const taxes = (propData.taxes ?? {}) as Record<string, unknown>
  const valuation = (propData.valuation ?? {}) as Record<string, unknown>
  const deeds = (propData.deeds ?? []) as Record<string, unknown>[]
  const lastDeed = deeds[0] ?? {}

  return {
    address: String(addr.formatted_street ?? addr.full_address ?? ''),
    city: String(addr.city ?? 'Austin'),
    state: String(addr.state ?? 'TX'),
    zipCode: String(addr.zip_code ?? ''),
    county: String(addr.county ?? ''),
    lat: Number(parcel.latitude ?? 0) || undefined,
    lng: Number(parcel.longitude ?? 0) || undefined,
    beds: Number(structure.beds_count ?? 0) || undefined,
    baths: Number(structure.baths ?? 0) || undefined,
    sqft: Number(structure.total_area_sq_ft ?? 0) || undefined,
    lotSize: Number(parcel.area_sq_ft ?? 0) || undefined,
    yearBuilt: Number(structure.year_built ?? 0) || undefined,
    propertyType: mapPropertyType(String(structure.type ?? '')),
    listType: 'MLS',
    source: 'estated',
    sourceId: String(propData.id ?? ''),
    estimatedValue: Number(valuation.value ?? 0) || undefined,
    taxAssessedValue: Number(taxes.assessed_value ?? 0) || undefined,
    lastSalePrice: Number(lastDeed.sale_price ?? 0) || undefined,
    lastSaleDate: String(lastDeed.sale_date ?? ''),
    rawData: propData,
  }
}

function mapPropertyType(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('single') || t.includes('sfr')) return 'SFR'
  if (t.includes('multi') || t.includes('duplex') || t.includes('triplex')) return 'Multi'
  if (t.includes('condo') || t.includes('townhouse')) return 'Condo'
  if (t.includes('land') || t.includes('vacant')) return 'Land'
  return 'SFR'
}
