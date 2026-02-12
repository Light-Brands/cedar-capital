/**
 * Unified Data Source Orchestrator
 * Coordinates across ATTOM, BatchData, and Estated APIs.
 * Handles fallback logic and deduplication.
 */

import { createServerClient } from '@/lib/supabase/client'
import type { PropertyInsert, LeadInsert } from '@/lib/supabase/types'
import type { DiscoveredProperty, OwnerInfo, SalesComp, PropertyValuation, DiscoveryQuery } from './types'
import * as attom from './attom'
import * as batchdata from './batchdata'
import * as estated from './estated'

/**
 * Get active Austin zip codes from the database.
 */
export async function getActiveZipCodes(): Promise<string[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('austin_zip_codes')
    .select('zip_code')
    .eq('is_active', true)

  if (error) {
    console.error('Failed to load zip codes:', error)
    return []
  }

  return data.map(z => z.zip_code)
}

/**
 * Discover new distressed properties across all Austin zip codes.
 * Queries ATTOM for pre-foreclosure and distressed listings.
 */
export async function discoverProperties(): Promise<DiscoveredProperty[]> {
  const zipCodes = await getActiveZipCodes()
  if (zipCodes.length === 0) return []

  // Query pre-foreclosures and distressed properties in parallel
  const [preForeclosures, distressed] = await Promise.all([
    attom.discoverPreForeclosures(zipCodes),
    attom.discoverDistressed({
      zipCodes,
      propertyTypes: ['SFR', 'Multi'],
      maxPrice: 500000,
    }),
  ])

  // Deduplicate by address
  const seen = new Set<string>()
  const unique: DiscoveredProperty[] = []

  for (const prop of [...preForeclosures, ...distressed]) {
    const key = `${prop.address.toLowerCase()}|${prop.zipCode}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(prop)
    }
  }

  return unique
}

/**
 * Save discovered properties to the database, skipping duplicates.
 * Returns the IDs of newly inserted properties.
 */
export async function saveDiscoveredProperties(properties: DiscoveredProperty[]): Promise<string[]> {
  const supabase = createServerClient()
  const newIds: string[] = []

  for (const prop of properties) {
    const insert: PropertyInsert = {
      address: prop.address,
      city: prop.city,
      state: prop.state,
      zip_code: prop.zipCode,
      county: prop.county ?? null,
      lat: prop.lat ?? null,
      lng: prop.lng ?? null,
      beds: prop.beds ?? null,
      baths: prop.baths ?? null,
      sqft: prop.sqft ?? null,
      lot_size: prop.lotSize ?? null,
      year_built: prop.yearBuilt ?? null,
      property_type: prop.propertyType ?? null,
      list_type: prop.listType ?? null,
      source: prop.source,
      source_id: prop.sourceId,
      asking_price: prop.askingPrice ?? null,
      zestimate: prop.estimatedValue ?? null,
      tax_assessed_value: prop.taxAssessedValue ?? null,
      last_sale_price: prop.lastSalePrice ?? null,
      last_sale_date: prop.lastSaleDate || null,
      days_on_market: prop.daysOnMarket ?? null,
      link: prop.link ?? null,
      photos: prop.photos ?? null,
      raw_data: JSON.parse(JSON.stringify(prop.rawData)),
    }

    const { data, error } = await supabase
      .from('properties')
      .upsert(insert, { onConflict: 'address,zip_code', ignoreDuplicates: true })
      .select('id')
      .maybeSingle()

    if (data?.id) {
      newIds.push(data.id)
    } else if (error) {
      console.error(`Failed to save property ${prop.address}:`, error)
    }
  }

  return newIds
}

/**
 * Enrich a property with owner info via skip tracing.
 * Uses BatchData as the primary (and only) skip trace source.
 */
export async function enrichWithOwnerInfo(
  propertyId: string,
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<OwnerInfo | null> {
  const supabase = createServerClient()

  // Check if we already have a lead for this property
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('property_id', propertyId)
    .limit(1)
    .maybeSingle()

  if (existing) return null // Already enriched

  const owner = await batchdata.skipTrace(address, city, state, zip)
  if (!owner) return null

  const insert: LeadInsert = {
    property_id: propertyId,
    owner_name: owner.ownerName ?? null,
    owner_type: owner.ownerType ?? null,
    mailing_address: owner.mailingAddress ?? null,
    phone_numbers: owner.phoneNumbers.length > 0 ? owner.phoneNumbers : null,
    email_addresses: owner.emailAddresses.length > 0 ? owner.emailAddresses : null,
    is_absentee: owner.isAbsentee ?? null,
    is_owner_occupied: owner.isOwnerOccupied ?? null,
    ownership_length_years: owner.ownershipLengthYears ?? null,
    estimated_equity: owner.estimatedEquity ?? null,
    mortgage_balance: owner.mortgageBalance ?? null,
    skip_trace_data: JSON.parse(JSON.stringify(owner.rawData)),
  }

  const { error } = await supabase.from('leads').insert(insert)
  if (error) console.error(`Failed to save lead for ${address}:`, error)

  return owner
}

/**
 * Get property valuation with ATTOM primary, Estated fallback.
 */
export async function getPropertyValuation(
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<PropertyValuation | null> {
  // Try ATTOM first
  const attomVal = await attom.getValuation(address, zip)
  if (attomVal && attomVal.estimatedValue > 0) return attomVal

  // Fallback to Estated
  const estatedVal = await estated.getValuation(address, city, state, zip)
  return estatedVal
}

/**
 * Get sales comps with ATTOM primary.
 */
export async function getComps(
  address: string,
  zip: string,
  radius: number = 0.5
): Promise<SalesComp[]> {
  const comps = await attom.getSalesComps(address, zip, radius)
  return comps
}

/**
 * Get properties that need enrichment (no associated lead yet).
 */
export async function getUnenrichedProperties(limit: number = 20) {
  const supabase = createServerClient()

  // Two-query approach: get properties and leads, then filter client-side
  const [propsResult, leadsResult] = await Promise.all([
    supabase
      .from('properties')
      .select('id, address, city, state, zip_code')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('leads')
      .select('property_id'),
  ])

  const leadPropertyIds = new Set((leadsResult.data ?? []).map(l => l.property_id))
  return (propsResult.data ?? []).filter(p => !leadPropertyIds.has(p.id)).slice(0, limit)
}

/**
 * Get properties that need analysis (no associated analysis yet).
 */
export async function getUnanalyzedProperties(limit: number = 20) {
  const supabase = createServerClient()

  // Get all properties and analyses, then find gaps
  const { data: allProps } = await supabase
    .from('properties')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: analyses } = await supabase
    .from('analyses')
    .select('property_id')

  const analyzedIds = new Set((analyses ?? []).map(a => a.property_id))
  return (allProps ?? []).filter(p => !analyzedIds.has(p.id)).slice(0, limit)
}
