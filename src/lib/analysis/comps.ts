/**
 * Comp Analysis Helpers
 * Process comparable sales data to determine ARV.
 */

export interface CompSale {
  address: string
  salePrice: number
  sqft: number
  beds: number
  baths: number
  saleDate: string
  distanceMiles: number
}

export interface CompAnalysis {
  compAddresses: string[]
  compPrices: number[]
  compDistances: number[]
  avgPricePerSqft: number
  medianPricePerSqft: number
  estimatedARV: number
  confidence: 'high' | 'medium' | 'low'
  compCount: number
}

/**
 * Filter comps to find the most relevant ones.
 * Criteria: within 0.5mi, similar sqft (+/- 25%), sold within 6 months.
 */
export function filterComps(
  comps: CompSale[],
  targetSqft: number,
  maxDistanceMiles: number = 0.5,
  maxAgeDays: number = 180,
  sqftTolerance: number = 0.25
): CompSale[] {
  const now = Date.now()
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  const minSqft = targetSqft * (1 - sqftTolerance)
  const maxSqft = targetSqft * (1 + sqftTolerance)

  return comps
    .filter(c => {
      if (c.distanceMiles > maxDistanceMiles) return false
      if (c.sqft < minSqft || c.sqft > maxSqft) return false
      // Accept comps with no sale date — Rentcast comparables often carry
      // listedDate but no lastSaleDate. Dropping them loses signal unnecessarily.
      const saleTime = new Date(c.saleDate).getTime()
      if (!isNaN(saleTime)) {
        if (now - saleTime > maxAgeMs) return false
      }
      return true
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
}

/**
 * Progressive comp filter — try strict criteria first, loosen until we have
 * ≥3 comps (or hit the final tier). Returns the matched subset plus the tier
 * label so callers can tell the user how relaxed the match was.
 *
 * 11308 Comano Dr (1,074 sqft house in a neighborhood of 2,400+ sqft new
 * construction) motivated this: at ±25% sqft tolerance, all 20 Rentcast
 * comps dropped out. Kelly still wants SOME signal even when the
 * subdivision doesn't have a clean tight match.
 */
export function progressiveFilterComps(
  comps: CompSale[],
  targetSqft: number,
): { filtered: CompSale[]; tier: string; radius: number } {
  const tiers = [
    { radius: 0.5, ageDays: 180, sqftTol: 0.25, label: 'strict (0.5mi, ±25%, 6mo)' },
    { radius: 1.0, ageDays: 365, sqftTol: 0.40, label: 'relaxed (1mi, ±40%, 1yr)' },
    { radius: 2.0, ageDays: 365, sqftTol: 0.60, label: 'wide (2mi, ±60%, 1yr)' },
    { radius: 5.0, ageDays: 730, sqftTol: 1.00, label: 'best available (5mi, any size)' },
  ]
  let last: CompSale[] = []
  for (const t of tiers) {
    const filtered = filterComps(comps, targetSqft, t.radius, t.ageDays, t.sqftTol)
    last = filtered
    if (filtered.length >= 3) {
      return { filtered, tier: t.label, radius: t.radius }
    }
  }
  const lastTier = tiers[tiers.length - 1]
  return { filtered: last, tier: lastTier.label, radius: lastTier.radius }
}

/**
 * Analyze comps and estimate ARV.
 * Uses median price/sqft of top comps, applied to target sqft.
 */
export function analyzeComps(
  comps: CompSale[],
  targetSqft: number,
  maxComps: number = 5
): CompAnalysis {
  const usable = comps.slice(0, maxComps)

  if (usable.length === 0) {
    return {
      compAddresses: [],
      compPrices: [],
      compDistances: [],
      avgPricePerSqft: 0,
      medianPricePerSqft: 0,
      estimatedARV: 0,
      confidence: 'low',
      compCount: 0,
    }
  }

  const pricesPerSqft = usable.map(c => c.salePrice / c.sqft)
  const sorted = [...pricesPerSqft].sort((a, b) => a - b)

  const avgPricePerSqft = pricesPerSqft.reduce((sum, p) => sum + p, 0) / pricesPerSqft.length

  const mid = Math.floor(sorted.length / 2)
  const medianPricePerSqft = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]

  const estimatedARV = Math.round(medianPricePerSqft * targetSqft)

  let confidence: 'high' | 'medium' | 'low' = 'low'
  if (usable.length >= 3) confidence = 'high'
  else if (usable.length >= 2) confidence = 'medium'

  return {
    compAddresses: usable.map(c => c.address),
    compPrices: usable.map(c => c.salePrice),
    compDistances: usable.map(c => Math.round(c.distanceMiles * 100) / 100),
    avgPricePerSqft: Math.round(avgPricePerSqft * 100) / 100,
    medianPricePerSqft: Math.round(medianPricePerSqft * 100) / 100,
    estimatedARV,
    confidence,
    compCount: usable.length,
  }
}
