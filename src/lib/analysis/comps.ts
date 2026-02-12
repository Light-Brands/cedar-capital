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
      const saleTime = new Date(c.saleDate).getTime()
      if (isNaN(saleTime)) return false
      const saleAge = now - saleTime
      if (saleAge > maxAgeMs) return false
      return true
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
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
    avgPricePerSqft: Math.round(avgPricePerSqft * 100) / 100,
    medianPricePerSqft: Math.round(medianPricePerSqft * 100) / 100,
    estimatedARV,
    confidence,
    compCount: usable.length,
  }
}
