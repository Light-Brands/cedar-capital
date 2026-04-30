/**
 * ATTOM Data API Client
 * Primary source for property discovery, details, valuations, and comps.
 * https://api.gateway.attomdata.com/propertyapi/v1.0.0
 *
 * Entitlement notes (verified against Cedar's trial key 2026-04-30):
 *   ✅  /property/detail
 *   ✅  /property/snapshot
 *   ✅  /valuation/homeequity      ← richest endpoint: AVM + LTV + lendable equity
 *   ❌  /property/preforeclosure   ← 404 "No rule matched" (paid product upgrade)
 *   ❌  /sale/comparables          ← 404 "No rule matched" (paid product upgrade)
 *
 * The unentitled endpoints fail soft (log + return empty) so the orchestrator
 * doesn't blow up. When Cedar upgrades, the same code path lights up.
 *
 * Every call gates on isAustinZip(zip) to keep trial spend Austin-bounded.
 */

import type { DiscoveredProperty, SalesComp, PropertyValuation, DiscoveryQuery } from './types'
import { isAustinZip } from '@/lib/geo/austin-zips'

const ATTOM_BASE_URL = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0'

// ============================================================
// Rich extracted shape for downstream persistence
// ============================================================

export interface AttomEnrichment {
  attomId: string | null
  detail: Record<string, unknown> | null
  avm: Record<string, unknown> | null
  avmValue: number | null
  avmLow: number | null
  avmHigh: number | null
  avmScore: number | null
  ltv: number | null
  lendableEquity: number | null
  totalLoanBalance: number | null
  condition: string | null
  quality: string | null
  yearBuiltEffective: number | null
  absenteeInd: string | null
  endpointsHit: string[]
  endpointsSkipped: { endpoint: string; reason: string }[]
}

export interface AttomProbeResult {
  ok: boolean
  entitled: { endpoint: string; entitled: boolean; status: number; sampleResponseBytes?: number }[]
  message: string
}

// ============================================================
// Internals
// ============================================================

function getHeaders(): HeadersInit {
  const apiKey = process.env.ATTOM_API_KEY
  if (!apiKey) throw new Error('ATTOM_API_KEY not configured')
  return {
    'Accept': 'application/json',
    'apikey': apiKey,
  }
}

interface AttomFetchResult {
  status: number
  data: unknown | null
  bytes: number
  unentitled: boolean
}

async function attomFetchSafe(path: string, params: Record<string, string> = {}): Promise<AttomFetchResult> {
  const url = new URL(`${ATTOM_BASE_URL}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { headers: getHeaders() })
  const text = await res.text()
  const bytes = text.length

  if (res.status === 404 && /no rule matched/i.test(text)) {
    return { status: res.status, data: null, bytes, unentitled: true }
  }
  if (!res.ok) {
    throw new Error(`ATTOM API error ${res.status} on ${path}: ${text.slice(0, 200)}`)
  }
  let data: unknown = null
  try { data = JSON.parse(text) } catch { /* tolerate empty bodies */ }
  return { status: res.status, data, bytes, unentitled: false }
}

async function attomFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const r = await attomFetchSafe(path, params)
  if (r.unentitled) throw new Error(`ATTOM endpoint ${path} not entitled on this subscription`)
  return r.data
}

// ============================================================
// Discovery
// ============================================================

/**
 * Discover pre-foreclosure properties in given zip codes.
 * NOTE: not entitled on Cedar's current subscription — returns [] gracefully.
 * The code path remains live for when we upgrade.
 */
export async function discoverPreForeclosures(zipCodes: string[]): Promise<DiscoveredProperty[]> {
  const properties: DiscoveredProperty[] = []
  for (const zip of zipCodes) {
    if (!(await isAustinZip(zip))) continue
    try {
      const r = await attomFetchSafe('/property/preforeclosure', { postalcode: zip, pagesize: '50' })
      if (r.unentitled) {
        console.warn(`[attom] /property/preforeclosure not entitled — skipping ${zip}`)
        continue
      }
      const records = extractPropertyRecords(r.data)
      for (const record of records) properties.push(mapAttomProperty(record, 'Pre-foreclosure', 'attom'))
    } catch (err) {
      console.error(`ATTOM pre-foreclosure error for ${zip}:`, err)
    }
  }
  return properties
}

/**
 * Discover distressed/below-market properties using ATTOM's property snapshot.
 */
export async function discoverDistressed(query: DiscoveryQuery): Promise<DiscoveredProperty[]> {
  const properties: DiscoveredProperty[] = []
  for (const zip of query.zipCodes) {
    if (!(await isAustinZip(zip))) continue
    try {
      const params: Record<string, string> = { postalcode: zip, pagesize: '50' }
      if (query.minPrice) params.minvalue = String(query.minPrice)
      if (query.maxPrice) params.maxvalue = String(query.maxPrice)
      if (query.minBeds) params.minbeds = String(query.minBeds)
      if (query.maxBeds) params.maxbeds = String(query.maxBeds)

      const data = await attomFetch('/property/snapshot', params) as Record<string, unknown>
      const records = extractPropertyRecords(data)
      for (const record of records) {
        const prop = mapAttomProperty(record, query.listTypes?.[0] ?? 'MLS', 'attom')
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
 * Get detailed property info by address. Returns the legacy DiscoveredProperty shape.
 * For richer enrichment that joins detail+AVM, prefer `enrichByAddress` below.
 */
export async function getPropertyDetails(address: string, zip: string): Promise<DiscoveredProperty | null> {
  if (!(await isAustinZip(zip))) {
    console.warn(`[attom] getPropertyDetails skipped — ${zip} outside Austin allowlist`)
    return null
  }
  try {
    const data = await attomFetch('/property/detail', { address1: address, address2: zip }) as Record<string, unknown>
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
  if (!(await isAustinZip(zip))) return null
  try {
    const data = await attomFetch('/valuation/homeequity', { address1: address, address2: zip }) as Record<string, unknown>
    const records = extractPropertyRecords(data)
    if (records.length === 0) return null
    const record = records[0]
    const avm = (record.avm || {}) as Record<string, unknown>
    const amount = (avm.amount || {}) as Record<string, unknown>
    const value = Number(amount.value ?? amount.scr ?? 0)
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
 * NOTE: not entitled on Cedar's current subscription — returns [] gracefully.
 */
export async function getSalesComps(
  address: string,
  zip: string,
  radius: number = 0.5,
  maxComps: number = 10,
): Promise<SalesComp[]> {
  if (!(await isAustinZip(zip))) return []
  try {
    const r = await attomFetchSafe('/sale/comparables', {
      address1: address,
      address2: zip,
      radius: String(radius),
      pagesize: String(maxComps),
    })
    if (r.unentitled) {
      console.warn(`[attom] /sale/comparables not entitled — using RentCast fallback`)
      return []
    }
    const records = extractPropertyRecords(r.data)
    return records.map(mapAttomToComp).filter((c): c is SalesComp => c !== null)
  } catch (err) {
    console.error(`ATTOM comps error:`, err)
    return []
  }
}

// ============================================================
// Rich enrichment (the new primary call shape)
// ============================================================

/**
 * Pull the full ATTOM enrichment for a single address. Hits both
 * /property/detail and /valuation/homeequity, returns extracted fields plus
 * raw payloads for jsonb persistence.
 *
 * Two endpoint hits = two billable calls per property. Caller should cache
 * by attomId before re-calling.
 */
export async function enrichByAddress(address: string, zip: string): Promise<AttomEnrichment | null> {
  const result: AttomEnrichment = {
    attomId: null, detail: null, avm: null,
    avmValue: null, avmLow: null, avmHigh: null, avmScore: null,
    ltv: null, lendableEquity: null, totalLoanBalance: null,
    condition: null, quality: null, yearBuiltEffective: null,
    absenteeInd: null,
    endpointsHit: [], endpointsSkipped: [],
  }

  if (!(await isAustinZip(zip))) {
    result.endpointsSkipped.push({ endpoint: 'all', reason: `zip ${zip} outside Austin allowlist` })
    return result
  }

  try {
    const r = await attomFetchSafe('/property/detail', { address1: address, address2: zip })
    if (r.unentitled) {
      result.endpointsSkipped.push({ endpoint: '/property/detail', reason: 'not entitled' })
    } else {
      const records = extractPropertyRecords(r.data)
      if (records.length > 0) {
        const rec = records[0]
        result.detail = rec
        result.attomId = pickAttomId(rec)
        const building = (rec.building || {}) as Record<string, unknown>
        const summary = (building.summary || {}) as Record<string, unknown>
        const construction = (building.construction || {}) as Record<string, unknown>
        const propSummary = (rec.summary || {}) as Record<string, unknown>
        result.condition = strOrNull(construction.condition)
        result.quality = strOrNull(summary.quality)
        result.yearBuiltEffective = numOrNull(summary.yearbuilteffective)
        result.absenteeInd = strOrNull(propSummary.absenteeInd)
        result.endpointsHit.push('/property/detail')
      }
    }
  } catch (err) {
    console.error('[attom] /property/detail error:', err)
  }

  try {
    const r = await attomFetchSafe('/valuation/homeequity', { address1: address, address2: zip })
    if (r.unentitled) {
      result.endpointsSkipped.push({ endpoint: '/valuation/homeequity', reason: 'not entitled' })
    } else {
      const records = extractPropertyRecords(r.data)
      if (records.length > 0) {
        const rec = records[0]
        result.avm = rec
        if (!result.attomId) result.attomId = pickAttomId(rec)
        const avm = (rec.avm || {}) as Record<string, unknown>
        const amount = (avm.amount || {}) as Record<string, unknown>
        result.avmValue = numOrNull(amount.value)
        result.avmLow = numOrNull(amount.low)
        result.avmHigh = numOrNull(amount.high)
        result.avmScore = numOrNull(amount.scr)
        const homeEquity = (rec.homeEquity || {}) as Record<string, unknown>
        result.ltv = numOrNull(homeEquity.LTV)
        result.lendableEquity = numOrNull(homeEquity.estimatedLendableEquity)
        result.totalLoanBalance = numOrNull(homeEquity.totalEstimatedLoanBalance)
        result.endpointsHit.push('/valuation/homeequity')
      }
    }
  } catch (err) {
    console.error('[attom] /valuation/homeequity error:', err)
  }

  return result
}

/**
 * Probe the ATTOM key against all known product endpoints and report which
 * are entitled. Used by /api/sources/attom/test in the dashboard.
 *
 * Updated 2026-04-30 after deeper docs review revealed Cedar's trial key has
 * access to 24 endpoints, not the 3 we initially probed. Comps + foreclosure
 * remain locked; everything else is open.
 */
export async function probeEntitlements(): Promise<AttomProbeResult> {
  const ADDR = { address1: '4529 Winona Court', address2: 'Denver, CO' }
  const ZIP = { postalcode: '78704', pagesize: '1' }
  const probes: { endpoint: string; path: string; params: Record<string, string> }[] = [
    // Property family
    { endpoint: '/property/address', path: '/property/address', params: ZIP },
    { endpoint: '/property/snapshot', path: '/property/snapshot', params: ZIP },
    { endpoint: '/property/basicprofile', path: '/property/basicprofile', params: ADDR },
    { endpoint: '/property/detail', path: '/property/detail', params: ADDR },
    { endpoint: '/property/expandedprofile', path: '/property/expandedprofile', params: ADDR },
    { endpoint: '/property/buildingpermits', path: '/property/buildingpermits', params: ADDR },
    { endpoint: '/property/detailmortgage', path: '/property/detailmortgage', params: ADDR },
    { endpoint: '/property/detailowner', path: '/property/detailowner', params: ADDR },
    { endpoint: '/property/detailmortgageowner', path: '/property/detailmortgageowner', params: ADDR },
    // Sale history
    { endpoint: '/sale/snapshot', path: '/sale/snapshot', params: { ...ZIP, startsalesearchdate: '2024-01-01', endsalesearchdate: '2024-12-31' } },
    { endpoint: '/sale/detail', path: '/sale/detail', params: ADDR },
    { endpoint: '/saleshistory/expandedhistory', path: '/saleshistory/expandedhistory', params: ADDR },
    { endpoint: '/saleshistory/detail', path: '/saleshistory/detail', params: ADDR },
    // Assessment
    { endpoint: '/assessment/snapshot', path: '/assessment/snapshot', params: ZIP },
    { endpoint: '/assessment/detail', path: '/assessment/detail', params: ADDR },
    { endpoint: '/assessmenthistory/detail', path: '/assessmenthistory/detail', params: ADDR },
    // AVM
    { endpoint: '/avm/detail', path: '/avm/detail', params: ADDR },
    { endpoint: '/avm/snapshot', path: '/avm/snapshot', params: ZIP },
    { endpoint: '/avmhistory/detail', path: '/avmhistory/detail', params: ADDR },
    { endpoint: '/valuation/homeequity', path: '/valuation/homeequity', params: ADDR },
    { endpoint: '/valuation/rentalavm', path: '/valuation/rentalavm', params: ADDR },
    // Locked products (probe to confirm they remain locked over time)
    { endpoint: '/sale/comparables', path: '/sale/comparables', params: { ...ADDR, radius: '0.5', pagesize: '1' } },
    { endpoint: '/property/preforeclosure', path: '/property/preforeclosure', params: ZIP },
    { endpoint: '/property/foreclosurehistory', path: '/property/foreclosurehistory', params: ADDR },
  ]

  const entitled: AttomProbeResult['entitled'] = []
  for (const p of probes) {
    try {
      const r = await attomFetchSafe(p.path, p.params)
      entitled.push({ endpoint: p.endpoint, entitled: !r.unentitled && r.status === 200, status: r.status, sampleResponseBytes: r.bytes })
    } catch (err) {
      entitled.push({ endpoint: p.endpoint, entitled: false, status: 0 })
      console.error(`[attom probe] ${p.endpoint} error:`, err)
    }
  }
  const okCount = entitled.filter((e) => e.entitled).length
  return {
    ok: okCount > 0,
    entitled,
    message: `${okCount}/${probes.length} ATTOM products entitled on this key`,
  }
}

// ============================================================
// New endpoint adapters (added 2026-04-30 after entitlement re-probe)
// ============================================================

export interface AttomComprehensiveEnrichment extends AttomEnrichment {
  // Owner data (from /property/detailowner or /property/detailmortgageowner)
  ownerName: string | null
  ownerMailingAddress: string | null
  ownerType: string | null         // ATTOM owner1.type
  // Mortgage data (from /property/detailmortgage)
  mortgageLenderName: string | null
  mortgageOriginationDate: string | null
  mortgageAmount: number | null
}

/**
 * Comprehensive enrichment via /property/detailmortgageowner — single call
 * returns property detail + AVM + mortgage + owner. Replaces the two-call
 * detail+homeequity pattern with a more complete one-call shape.
 */
export async function enrichComprehensive(address: string, zip: string): Promise<AttomComprehensiveEnrichment | null> {
  const empty: AttomComprehensiveEnrichment = {
    attomId: null, detail: null, avm: null,
    avmValue: null, avmLow: null, avmHigh: null, avmScore: null,
    ltv: null, lendableEquity: null, totalLoanBalance: null,
    condition: null, quality: null, yearBuiltEffective: null, absenteeInd: null,
    endpointsHit: [], endpointsSkipped: [],
    ownerName: null, ownerMailingAddress: null, ownerType: null,
    mortgageLenderName: null, mortgageOriginationDate: null, mortgageAmount: null,
  }
  if (!(await isAustinZip(zip))) {
    empty.endpointsSkipped.push({ endpoint: 'all', reason: `zip ${zip} outside Austin allowlist` })
    return empty
  }
  try {
    const r = await attomFetchSafe('/property/detailmortgageowner', { address1: address, address2: zip })
    if (r.unentitled) {
      empty.endpointsSkipped.push({ endpoint: '/property/detailmortgageowner', reason: 'not entitled' })
      return empty
    }
    const records = extractPropertyRecords(r.data)
    if (records.length === 0) return empty
    const rec = records[0]

    empty.detail = rec
    empty.attomId = pickAttomId(rec)

    const building = (rec.building || {}) as Record<string, unknown>
    const summary = (building.summary || {}) as Record<string, unknown>
    const construction = (building.construction || {}) as Record<string, unknown>
    const propSummary = (rec.summary || {}) as Record<string, unknown>
    empty.condition = strOrNull(construction.condition)
    empty.quality = strOrNull(summary.quality)
    empty.yearBuiltEffective = numOrNull(summary.yearbuilteffective)
    empty.absenteeInd = strOrNull(propSummary.absenteeInd)

    const avm = (rec.avm || {}) as Record<string, unknown>
    const amount = (avm.amount || {}) as Record<string, unknown>
    empty.avmValue = numOrNull(amount.value)
    empty.avmLow = numOrNull(amount.low)
    empty.avmHigh = numOrNull(amount.high)
    empty.avmScore = numOrNull(amount.scr)

    // Owner
    const owner = ((rec.owner as Record<string, unknown>) || {}) as Record<string, unknown>
    const owner1 = (owner.owner1 || {}) as Record<string, unknown>
    const mailing = (owner.mailingAddress || {}) as Record<string, unknown>
    const fullName = strOrNull((owner1.fullName as string) ?? `${owner1.firstNameAndMi ?? ''} ${owner1.lastName ?? ''}`.trim())
    empty.ownerName = fullName
    empty.ownerMailingAddress = strOrNull(mailing.oneLine ?? mailing.line1)
    empty.ownerType = strOrNull(owner1.type)

    // Mortgage
    const mortgage = ((rec.mortgage as Record<string, unknown>) || {}) as Record<string, unknown>
    const m1 = (mortgage.FirstConcurrent || mortgage.firstConcurrent || mortgage[Object.keys(mortgage)[0] ?? ''] || {}) as Record<string, unknown>
    const lender = (m1.lender || {}) as Record<string, unknown>
    const mAmount = (m1.amount || {}) as Record<string, unknown>
    empty.mortgageLenderName = strOrNull(lender.fullName ?? lender.lastName)
    empty.mortgageOriginationDate = strOrNull(m1.dateOfRecording ?? m1.recordingDate)
    empty.mortgageAmount = numOrNull(mAmount.loanAmount ?? mAmount.amount)

    empty.endpointsHit.push('/property/detailmortgageowner')
    return empty
  } catch (err) {
    console.error('[attom] /property/detailmortgageowner error:', err)
    return empty
  }
}

/**
 * Get building permit history for a property. Recent permits = recent
 * investment (less rehab needed). Long permit gap = deferred maintenance signal.
 */
export interface AttomPermit {
  permitNumber: string | null
  permitType: string | null
  description: string | null
  effectiveDate: string | null
  amount: number | null
  raw: Record<string, unknown>
}

export async function getBuildingPermits(address: string, zip: string): Promise<AttomPermit[]> {
  if (!(await isAustinZip(zip))) return []
  try {
    const r = await attomFetchSafe('/property/buildingpermits', { address1: address, address2: zip })
    if (r.unentitled) return []
    const records = extractPropertyRecords(r.data)
    if (records.length === 0) return []

    const permits: AttomPermit[] = []
    for (const rec of records) {
      const buildingPermits = (rec.buildingPermits as Record<string, unknown>[] | undefined) ?? []
      for (const p of buildingPermits) {
        permits.push({
          permitNumber: strOrNull((p as Record<string, unknown>).permitNumber),
          permitType: strOrNull((p as Record<string, unknown>).type ?? (p as Record<string, unknown>).permitType),
          description: strOrNull((p as Record<string, unknown>).description),
          effectiveDate: strOrNull((p as Record<string, unknown>).effectiveDate ?? (p as Record<string, unknown>).date),
          amount: numOrNull((p as Record<string, unknown>).jobValue ?? (p as Record<string, unknown>).amount),
          raw: p as Record<string, unknown>,
        })
      }
    }
    return permits
  } catch (err) {
    console.error('[attom] /property/buildingpermits error:', err)
    return []
  }
}

/**
 * Get rental AVM (estimated monthly rent) for cap-rate analysis.
 * Particularly valuable for multi-unit deals where rent matters more than ARV.
 */
export async function getRentalAvm(address: string, zip: string): Promise<{
  estimatedRent: number | null
  rentLow: number | null
  rentHigh: number | null
  rentRange: { value: number; low: number; high: number } | null
} | null> {
  if (!(await isAustinZip(zip))) return null
  try {
    const r = await attomFetchSafe('/valuation/rentalavm', { address1: address, address2: zip })
    if (r.unentitled) return null
    const records = extractPropertyRecords(r.data)
    if (records.length === 0) return null
    const rec = records[0]
    const rentavm = (rec.avm || rec.rentalavm || {}) as Record<string, unknown>
    const amount = (rentavm.amount || {}) as Record<string, unknown>
    return {
      estimatedRent: numOrNull(amount.value),
      rentLow: numOrNull(amount.low),
      rentHigh: numOrNull(amount.high),
      rentRange: amount.value && amount.low && amount.high
        ? { value: Number(amount.value), low: Number(amount.low), high: Number(amount.high) }
        : null,
    }
  } catch (err) {
    console.error('[attom] /valuation/rentalavm error:', err)
    return null
  }
}

// ============================================================
// Helpers
// ============================================================

function extractPropertyRecords(data: unknown): Record<string, unknown>[] {
  const d = data as Record<string, unknown>
  if (!d) return []
  const propWrapper = d.property as Record<string, unknown>[] | undefined
  if (Array.isArray(propWrapper)) return propWrapper

  const status = d.status as Record<string, unknown> | undefined
  if (status?.msg === 'SuccessWithResult' || status?.total) {
    const inner = d.property ?? d.properties ?? d.result ?? d.data
    if (Array.isArray(inner)) return inner as Record<string, unknown>[]
  }
  return []
}

function pickAttomId(rec: Record<string, unknown>): string | null {
  const id = (rec.identifier || {}) as Record<string, unknown>
  const candidate = id.attomId ?? id.Id ?? rec.attomId ?? rec.identifier
  if (candidate === null || candidate === undefined) return null
  return String(candidate)
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n !== 0 ? n : null
}

function mapAttomProperty(
  record: Record<string, unknown>,
  listType: string,
  source: string,
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
  const saleAmount = (sale.amount || sale.saleAmountData || {}) as Record<string, unknown>
  const listing = (record.listing || {}) as Record<string, unknown>
  const listingAmount = (listing.amount || listing.listingAmount || {}) as Record<string, unknown>

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
    sourceId: String(record.identifier ?? (record as { attomId?: unknown }).attomId ?? (record as { id?: unknown }).id ?? ''),
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
