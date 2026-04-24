/**
 * Property-type classifier + TCAD parcel-mismatch detector.
 *
 * Adapters tag `property_type` at discover time (SFR, Condo, Townhouse, etc.)
 * but the signal is often noisy — address alone can reveal "Unit 2" or "#301"
 * that the adapter's propertyType string missed.
 *
 * Separately, when TCAD is asked for a parcel at "200 Congress Ave, Unit 26C",
 * it often returns the whole-building parcel with a $7M+ market value. That
 * makes the analyzer produce nonsense ARVs on condos/multi-unit. We detect
 * the likely mismatch and let callers skip the TCAD number.
 */

export type UnitType =
  | 'SFR'
  | 'Condo'
  | 'Townhouse'
  | 'Duplex'
  | 'Multi'
  | 'Mobile'
  | 'Land'
  | 'Unknown'

export interface ClassifierInput {
  property_type?: string | null
  address?: string | null
  lot_size?: number | null
  sqft?: number | null
  beds?: number | null
}

const UNIT_REGEX = /\b(unit|apt|apartment|suite|ste|loft)\b\s*[\w\d-]*|\s#\s*[\w\d-]+|,\s*#\s*[\w\d-]+/i

export function classifyUnitType(input: ClassifierInput): UnitType {
  const raw = (input.property_type ?? '').toLowerCase()
  const addr = (input.address ?? '').toLowerCase()

  // Adapter-declared type wins if it's specific
  if (raw.includes('single')) return 'SFR'
  if (raw.includes('sfr')) return 'SFR'
  if (raw.includes('condo')) return 'Condo'
  if (raw.includes('town')) return 'Townhouse'
  if (raw.includes('duplex')) return 'Duplex'
  if (raw.includes('multi')) return 'Multi'
  if (raw.includes('mobile') || raw.includes('manufactured')) return 'Mobile'
  if (raw.includes('land') || raw.includes('lot') || raw.includes('vacant')) return 'Land'

  // Address-based inference — "Unit 2", "Apt 301", "#5206"
  if (UNIT_REGEX.test(addr)) return 'Condo'

  // Tiny lot + residence = almost certainly condo or townhouse
  if (input.lot_size != null && input.lot_size > 0 && input.lot_size < 2000 && (input.beds ?? 0) > 0) {
    return 'Condo'
  }

  // Lots ≥ 2000 sqft with a home default to SFR
  if ((input.sqft ?? 0) > 0 && (input.beds ?? 0) > 0) return 'SFR'

  return 'Unknown'
}

export function isMultiUnit(type: UnitType): boolean {
  return type === 'Condo' || type === 'Townhouse' || type === 'Duplex' || type === 'Multi'
}

/**
 * TCAD parcel mismatch: when a condo/townhouse unit's listing points to a
 * TCAD parcel that's actually the whole building or a much larger asset.
 * Signal: market_value / asking_price ratio outside of plausible appreciation.
 *
 * For single-family, ratios > 5 usually mean wrong match (data bug).
 * For condos, ratios > 3 are likely building-wide parcel.
 * For land, ratios don't apply (structure vs. land value mismatch expected).
 */
export function isParcelMismatchLikely(
  type: UnitType,
  marketValue: number | null | undefined,
  askingPrice: number | null | undefined,
): boolean {
  if (!marketValue || !askingPrice || askingPrice <= 0) return false
  if (marketValue <= askingPrice) return false
  const ratio = marketValue / askingPrice

  if (isMultiUnit(type)) return ratio > 3
  if (type === 'SFR') return ratio > 5
  return false
}

/**
 * Auction detector: flags listings where the "asking price" is really an
 * auction start bid / foreclosure opening, not a real ask. Those look like
 * huge discounts but aren't — the property will sell at the actual bid +
 * buyer's premium, or the bank has a much higher reserve.
 *
 * Signals, in priority order:
 *   1. Explicit list_type says auction/foreclosure/short sale/REO
 *   2. Keyword match in property_type or notes
 *   3. Price ratio < 50% of TCAD market value — no legit listing is this low
 *      outside of an auction or a severely distressed REO
 */
export function isAuctionLikely(input: {
  list_type?: string | null
  property_type?: string | null
  notes?: string | null
  asking_price?: number | null
  market_value?: number | null
  appraised_value?: number | null
  tax_assessed_value?: number | null
}): { likely: boolean; reason: string | null } {
  const explicit = (input.list_type ?? '').toLowerCase()
  if (/auction|foreclosure|short.sale|reo|bank.owned|trustee|sheriff/.test(explicit)) {
    return { likely: true, reason: input.list_type ?? 'Auction/foreclosure' }
  }
  const context = [input.property_type, input.notes].filter(Boolean).join(' ').toLowerCase()
  if (/\bauction\b|\bforeclosure\b|\bshort sale\b|\breo\b|opening bid|starting bid|trustee sale/.test(context)) {
    return { likely: true, reason: 'auction/foreclosure keyword in listing' }
  }
  const asking = input.asking_price
  const reference = input.market_value ?? input.appraised_value ?? input.tax_assessed_value
  if (asking && reference && asking > 0 && reference > 0) {
    const ratio = asking / reference
    if (ratio < 0.5) {
      return { likely: true, reason: `asking is ${Math.round(ratio * 100)}% of market — possible auction/foreclosure` }
    }
  }
  return { likely: false, reason: null }
}
