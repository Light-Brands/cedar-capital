import type { Property } from '@/lib/supabase/types'

// Rehab cost matrix (from Cedar Capital spreadsheet)
export const REHAB_COSTS = {
  kitchen: 8000,
  bathPerUnit: 2000,
  interiorPaintPerSqft: 2,
  exteriorPaintPerSqft: 2,
  flooringPerSqft: 3,
  windowPerUnit: 350,
  misc: 2000,
  roof: 10000,
  sheetrockPerRoom: 500,
  framingPerSqft: 7,
  electrical: 5000,
  plumbing: 8000,
  hvac: 10000,
  landscape: 2000,
  foundationMin: 10000,
  foundationMax: 50000,
} as const

export type RehabLevel = 'light' | 'medium' | 'heavy'

export interface RehabEstimate {
  level: RehabLevel
  kitchen: number
  bath: number
  interiorPaint: number
  exteriorPaint: number
  flooring: number
  windows: number
  misc: number
  roof: number
  sheetrock: number
  framing: number
  electrical: number
  plumbing: number
  hvac: number
  landscape: number
  foundation: number
  other: number
  total: number
}

// Estimate number of windows based on sqft
function estimateWindowCount(sqft: number): number {
  return Math.max(6, Math.round(sqft / 150))
}

// Estimate number of rooms (excluding kitchen/baths)
function estimateRoomCount(beds: number, sqft: number): number {
  // bedrooms + living room + dining room
  return beds + Math.max(1, Math.floor(sqft / 600))
}

/**
 * Infer rehab level from property signals.
 * - Light: cosmetic only (paint, flooring, kitchen refresh)
 * - Medium: + roof, HVAC, windows
 * - Heavy: + foundation, framing, electrical, plumbing
 */
export function inferRehabLevel(property: Property): RehabLevel {
  const currentYear = new Date().getFullYear()
  const age = property.year_built ? currentYear - property.year_built : 30
  const priceToAssessed = (property.asking_price && property.tax_assessed_value)
    ? property.asking_price / property.tax_assessed_value
    : 1
  const dom = property.days_on_market ?? 30

  let riskScore = 0

  // Age-based risk
  if (age > 50) riskScore += 3
  else if (age > 30) riskScore += 2
  else if (age > 15) riskScore += 1

  // Price significantly below assessed value indicates poor condition
  if (priceToAssessed < 0.5) riskScore += 3
  else if (priceToAssessed < 0.7) riskScore += 2
  else if (priceToAssessed < 0.85) riskScore += 1

  // High DOM may indicate issues
  if (dom > 120) riskScore += 2
  else if (dom > 60) riskScore += 1

  // Distress signals
  if (property.list_type === 'Pre-foreclosure' || property.list_type === 'Auction') riskScore += 2
  if (property.list_type === 'REO') riskScore += 1

  if (riskScore >= 6) return 'heavy'
  if (riskScore >= 3) return 'medium'
  return 'light'
}

/**
 * Estimate full rehab costs based on property details and inferred condition.
 * Directly ports the Cedar Capital spreadsheet's rehab cost model.
 */
export function estimateRehab(
  property: Property,
  overrideLevel?: RehabLevel
): RehabEstimate {
  const level = overrideLevel ?? inferRehabLevel(property)
  const sqft = property.sqft ?? 1500
  const beds = property.beds ?? 3
  const baths = property.baths ?? 2
  const windowCount = estimateWindowCount(sqft)
  const roomCount = estimateRoomCount(beds, sqft)

  const estimate: RehabEstimate = {
    level,
    kitchen: 0,
    bath: 0,
    interiorPaint: 0,
    exteriorPaint: 0,
    flooring: 0,
    windows: 0,
    misc: 0,
    roof: 0,
    sheetrock: 0,
    framing: 0,
    electrical: 0,
    plumbing: 0,
    hvac: 0,
    landscape: 0,
    foundation: 0,
    other: 0,
    total: 0,
  }

  // Light rehab: cosmetic updates
  estimate.kitchen = REHAB_COSTS.kitchen
  estimate.bath = REHAB_COSTS.bathPerUnit * baths
  estimate.interiorPaint = REHAB_COSTS.interiorPaintPerSqft * sqft
  estimate.exteriorPaint = REHAB_COSTS.exteriorPaintPerSqft * sqft
  estimate.flooring = REHAB_COSTS.flooringPerSqft * sqft
  estimate.misc = REHAB_COSTS.misc
  estimate.landscape = REHAB_COSTS.landscape

  // Medium rehab: add mechanical/structural cosmetic
  if (level === 'medium' || level === 'heavy') {
    estimate.roof = REHAB_COSTS.roof
    estimate.hvac = REHAB_COSTS.hvac
    estimate.windows = REHAB_COSTS.windowPerUnit * windowCount
    estimate.sheetrock = REHAB_COSTS.sheetrockPerRoom * roomCount
  }

  // Heavy rehab: add major structural/systems
  if (level === 'heavy') {
    estimate.framing = REHAB_COSTS.framingPerSqft * Math.round(sqft * 0.15) // ~15% of sqft needs framing
    estimate.electrical = REHAB_COSTS.electrical
    estimate.plumbing = REHAB_COSTS.plumbing
    estimate.foundation = REHAB_COSTS.foundationMin
  }

  estimate.total =
    estimate.kitchen +
    estimate.bath +
    estimate.interiorPaint +
    estimate.exteriorPaint +
    estimate.flooring +
    estimate.windows +
    estimate.misc +
    estimate.roof +
    estimate.sheetrock +
    estimate.framing +
    estimate.electrical +
    estimate.plumbing +
    estimate.hvac +
    estimate.landscape +
    estimate.foundation +
    estimate.other

  return estimate
}

/**
 * Create a rehab estimate from manually provided line items.
 */
export function createManualRehab(items: Partial<Omit<RehabEstimate, 'total' | 'level'>>): RehabEstimate {
  const estimate: RehabEstimate = {
    level: 'medium',
    kitchen: items.kitchen ?? 0,
    bath: items.bath ?? 0,
    interiorPaint: items.interiorPaint ?? 0,
    exteriorPaint: items.exteriorPaint ?? 0,
    flooring: items.flooring ?? 0,
    windows: items.windows ?? 0,
    misc: items.misc ?? 0,
    roof: items.roof ?? 0,
    sheetrock: items.sheetrock ?? 0,
    framing: items.framing ?? 0,
    electrical: items.electrical ?? 0,
    plumbing: items.plumbing ?? 0,
    hvac: items.hvac ?? 0,
    landscape: items.landscape ?? 0,
    foundation: items.foundation ?? 0,
    other: items.other ?? 0,
    total: 0,
  }

  estimate.total =
    estimate.kitchen + estimate.bath + estimate.interiorPaint +
    estimate.exteriorPaint + estimate.flooring + estimate.windows +
    estimate.misc + estimate.roof + estimate.sheetrock + estimate.framing +
    estimate.electrical + estimate.plumbing + estimate.hvac +
    estimate.landscape + estimate.foundation + estimate.other

  return estimate
}
